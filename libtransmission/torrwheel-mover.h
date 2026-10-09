// torrwheel: copies files between filesystems off the session thread.
// License text can be found in the licenses/ folder.

#pragma once

#ifndef __TRANSMISSION__
#error only libtransmission should #include this header.
#endif

#include <atomic>
#include <condition_variable>
#include <cstdint> // uint64_t
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

#include "libtransmission/transmission.h" // tr_file_index_t, tr_torrent_id_t

#include "libtransmission/error.h"

namespace torrwheel
{
// One worker thread for the whole session: a job is copied file by file, jobs one after another.
// A file is copied to `dst + TmpSuffix`; putting it in place and removing `src` is the owner's step.
class Mover
{
public:
    static auto constexpr TmpSuffix = std::string_view{ ".tw-move" };

    struct File
    {
        tr_file_index_t index = {};
        std::string src;
        std::string dst;
        uint64_t size = {};
    };

    // Shared with whoever reports progress; `bytes_done` is written by the worker only.
    struct Progress
    {
        std::atomic<uint64_t> bytes_done = {};
        uint64_t bytes_total = {};
    };

    // Called from the worker thread.
    class Mediator
    {
    public:
        virtual ~Mediator() = default;

        // The copy of `file` is complete and flushed to disk under its temporary name.
        virtual void on_file_copied(File const& file) = 0;

        // The job is over. On `cancelled` or an error the temporary files are already removed.
        virtual void on_done(bool cancelled, tr_error const& error) = 0;
    };

    // `throttle_bps`: bytes per second to copy at, for tests and the stand; zero is no limit.
    explicit Mover(uint64_t throttle_bps = 0U);
    ~Mover();

    Mover(Mover const&) = delete;
    Mover(Mover&&) = delete;
    Mover& operator=(Mover const&) = delete;
    Mover& operator=(Mover&&) = delete;

    void add(
        tr_torrent_id_t id,
        std::vector<File> files,
        std::shared_ptr<Progress> progress,
        std::unique_ptr<Mediator> mediator);

    // Returns once the torrent's job is neither queued nor running; its `on_done(true, ...)` has been called.
    void cancel(tr_torrent_id_t id);

    [[nodiscard]] static std::string tmp_path(std::string_view dst);

private:
    struct Job
    {
        tr_torrent_id_t id = {};
        std::vector<File> files;
        std::shared_ptr<Progress> progress;
        std::unique_ptr<Mediator> mediator;
    };

    void thread_func();
    void run(Job& job);
    [[nodiscard]] bool copy(File const& file, Progress& progress, tr_error& error);

    static void remove_tmp_files(Job const& job);

    uint64_t const throttle_bps_;

    std::mutex mutex_;
    std::condition_variable wake_cv_;
    std::condition_variable idle_cv_;
    std::deque<Job> todo_;
    tr_torrent_id_t current_id_ = {};
    bool is_running_job_ = false;
    bool is_stopping_ = false;
    std::atomic<bool> cancel_current_ = false;

    std::thread thread_;
};
} // namespace torrwheel
