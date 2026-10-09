// torrwheel: copies files between filesystems off the session thread.
// License text can be found in the licenses/ folder.

#include <algorithm>
#include <chrono>
#include <cstddef> // std::byte
#include <cstdint> // uint64_t
#include <memory>
#include <mutex>
#include <string>
#include <string_view>
#include <thread>
#include <utility> // std::move()
#include <vector>

#ifndef _WIN32
#include <unistd.h> // fsync()
#endif

#include "libtransmission/transmission.h"

#include "libtransmission/error.h"
#include "libtransmission/file.h"
#include "libtransmission/torrwheel-mover.h"

using namespace std::chrono_literals;

namespace torrwheel
{
namespace
{
auto constexpr ChunkSize = uint64_t{ 1024U * 1024U };

// The copy has to be on disk before its source is removed.
[[nodiscard]] bool flush_to_disk(tr_sys_file_t handle, tr_error& error)
{
#ifdef _WIN32
    (void)handle;
    (void)error;
    return true;
#else
    if (fsync(handle) == 0)
    {
        return true;
    }

    error.set_from_errno(errno);
    return false;
#endif
}
} // namespace

Mover::Mover(uint64_t throttle_bps)
    : throttle_bps_{ throttle_bps }
    , thread_{ &Mover::thread_func, this }
{
}

Mover::~Mover()
{
    {
        auto const lock = std::scoped_lock{ mutex_ };
        is_stopping_ = true;
        cancel_current_ = true;
    }

    wake_cv_.notify_one();
    thread_.join();
}

std::string Mover::tmp_path(std::string_view dst)
{
    auto path = std::string{ dst };
    path += TmpSuffix;
    return path;
}

void Mover::add(
    tr_torrent_id_t id,
    std::vector<File> files,
    std::shared_ptr<Progress> progress,
    std::unique_ptr<Mediator> mediator)
{
    {
        auto const lock = std::scoped_lock{ mutex_ };
        todo_.push_back(Job{ id, std::move(files), std::move(progress), std::move(mediator) });
    }

    wake_cv_.notify_one();
}

void Mover::cancel(tr_torrent_id_t id)
{
    auto lock = std::unique_lock{ mutex_ };

    // not started yet: it ends here, with nothing on disk
    for (auto iter = std::begin(todo_); iter != std::end(todo_);)
    {
        if (iter->id == id)
        {
            iter->mediator->on_done(true, {});
            iter = todo_.erase(iter);
        }
        else
        {
            ++iter;
        }
    }

    // being copied: wait for the worker to let go of it
    if (is_running_job_ && current_id_ == id)
    {
        cancel_current_ = true;
        idle_cv_.wait(lock, [this, id]() { return !is_running_job_ || current_id_ != id; });
    }
}

void Mover::thread_func()
{
    for (;;)
    {
        auto job = Job{};

        {
            auto lock = std::unique_lock{ mutex_ };
            wake_cv_.wait(lock, [this]() { return is_stopping_ || !std::empty(todo_); });

            if (is_stopping_)
            {
                // what never started ends as cancelled
                for (auto const& pending : todo_)
                {
                    pending.mediator->on_done(true, {});
                }
                todo_.clear();
                return;
            }

            job = std::move(todo_.front());
            todo_.pop_front();
            current_id_ = job.id;
            is_running_job_ = true;
            cancel_current_ = false;
        }

        run(job);

        {
            auto const lock = std::scoped_lock{ mutex_ };
            is_running_job_ = false;
        }

        idle_cv_.notify_all();
    }
}

void Mover::run(Job& job)
{
    auto error = tr_error{};

    for (auto const& file : job.files)
    {
        if (cancel_current_ || !copy(file, *job.progress, error))
        {
            break;
        }

        job.mediator->on_file_copied(file);
    }

    auto const cancelled = cancel_current_.load();
    if (cancelled || error)
    {
        remove_tmp_files(job);
    }

    job.mediator->on_done(cancelled, error);
}

// Whatever was not put in place yet; a file the owner already renamed has no temporary file left.
void Mover::remove_tmp_files(Job const& job)
{
    for (auto const& file : job.files)
    {
        tr_sys_path_remove(tmp_path(file.dst).c_str());
    }
}

bool Mover::copy(File const& file, Progress& progress, tr_error& error)
{
    auto const tmp = tmp_path(file.dst);

    auto const in = tr_sys_file_open(file.src.c_str(), TR_SYS_FILE_READ | TR_SYS_FILE_SEQUENTIAL, 0, &error);
    if (in == TR_BAD_SYS_FILE)
    {
        error.prefix_message("Unable to open source file: ");
        return false;
    }

    auto const out = tr_sys_file_open(
        tmp.c_str(),
        TR_SYS_FILE_WRITE | TR_SYS_FILE_CREATE | TR_SYS_FILE_TRUNCATE | TR_SYS_FILE_SEQUENTIAL,
        0666,
        &error);
    if (out == TR_BAD_SYS_FILE)
    {
        error.prefix_message("Unable to open destination file: ");
        tr_sys_file_close(in);
        return false;
    }

    auto buffer = std::vector<std::byte>(ChunkSize);
    auto const started_at = std::chrono::steady_clock::now();
    auto copied = uint64_t{};
    auto ok = true;

    while (ok && !cancel_current_)
    {
        auto n_read = uint64_t{};
        if (!tr_sys_file_read(in, std::data(buffer), std::size(buffer), &n_read, &error))
        {
            error.prefix_message("Unable to read file: ");
            ok = false;
            break;
        }

        if (n_read == 0U)
        {
            break;
        }

        // a write may be short: carry on from where it stopped
        for (auto n_written = uint64_t{}; ok && n_written < n_read;)
        {
            auto n_this_pass = uint64_t{};
            if (!tr_sys_file_write(out, std::data(buffer) + n_written, n_read - n_written, &n_this_pass, &error))
            {
                error.prefix_message("Unable to write file: ");
                ok = false;
            }

            n_written += n_this_pass;
        }

        if (ok)
        {
            copied += n_read;
            progress.bytes_done += n_read;

            if (throttle_bps_ != 0U)
            {
                auto const due = started_at + std::chrono::microseconds{ copied * 1000000U / throttle_bps_ };
                while (!cancel_current_ && std::chrono::steady_clock::now() < due)
                {
                    std::this_thread::sleep_for(
                        std::min<std::chrono::steady_clock::duration>(50ms, due - std::chrono::steady_clock::now()));
                }
            }
        }
    }

    tr_sys_file_close(in);

    if (ok && !cancel_current_ && !flush_to_disk(out, error))
    {
        error.prefix_message("Unable to flush file: ");
        ok = false;
    }

    if (auto close_error = tr_error{}; !tr_sys_file_close(out, &close_error) && ok)
    {
        error = close_error;
        error.prefix_message("Unable to close file: ");
        ok = false;
    }

    return ok && !cancel_current_;
}
} // namespace torrwheel
