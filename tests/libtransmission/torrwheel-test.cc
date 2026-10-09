// torrwheel: tests of the fork's own file placement rules and settings.
// License text can be found in the licenses/ folder.

#include <algorithm>
#include <array>
#include <atomic>
#include <cerrno> // EBUSY
#include <chrono>
#include <cstdlib> // setenv()
#include <fstream>
#include <future>
#include <iterator>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include <fmt/format.h>

#include <libtransmission/transmission.h>

#include <libtransmission/block-info.h>
#include <libtransmission/cache.h> // tr_cacheWriteBlock()
#include <libtransmission/error.h>
#include <libtransmission/file.h> // tr_sys_path_*()
#include <libtransmission/inout.h> // tr_ioRead()
#include <libtransmission/quark.h>
#include <libtransmission/torrent.h>
#include <libtransmission/torrent-files.h>
#include <libtransmission/torrwheel-geoip.h>
#include <libtransmission/torrwheel-mover.h>
#include <libtransmission/tr-strbuf.h>
#include <libtransmission/variant.h>

#include "gtest/gtest.h"
#include "test-fixtures.h"

using namespace std::literals;

namespace libtransmission::test
{

class TorrwheelTest : public SessionTest
{
protected:
    void SetUp() override
    {
        if (auto* map = settings()->get_if<tr_variant::Map>(); map != nullptr)
        {
            map->insert_or_assign(TR_KEY_download_dir, "Downloads"sv);
            map->insert_or_assign(TR_KEY_incomplete_dir, "Incomplete"sv);
            map->insert_or_assign(TR_KEY_incomplete_dir_enabled, true);

            auto dirs = tr_variant::Vector{};
            dirs.emplace_back("/Downloads"sv);
            dirs.emplace_back("/Dumps"sv);
            map->insert_or_assign(TR_KEY_download_dirs, std::move(dirs));
        }

        SessionTest::SetUp();
        tr_sessionSetIncompleteFileNamingEnabled(session_, true);
    }

    // file 0 of the zero torrent, wanted or not
    static void setFirstFileWanted(tr_torrent* tor, bool wanted)
    {
        auto const file = tr_file_index_t{ 0 };
        tr_torrentSetFileDLs(tor, &file, 1, wanted);
    }

    [[nodiscard]] bool waitForFile(
        tr_torrent const* tor,
        tr_file_index_t file,
        std::string_view dir,
        std::string_view suffix = ""sv)
    {
        auto const expected = tr_pathbuf{ dir, '/', tr_torrentFile(tor, file).name, suffix };
        return waitFor([&]() { return expected == tr_torrentFindFile(tor, file); }, MaxWaitMsec);
    }

    // writes the piece the partial zero torrent lacks
    void writeFirstPiece(tr_torrent* tor)
    {
        auto const [begin, end] = tor->block_span_for_piece(0);

        for (auto block = begin; block < end; ++block)
        {
            auto done = false;
            session_->run_in_session_thread(
                [this, tor, block, &done]()
                {
                    auto buf = std::make_unique<Cache::BlockData>(tr_block_info::BlockSize);
                    std::fill_n(std::data(*buf), tr_block_info::BlockSize, '\0');
                    session_->cache->write_block(tor->id(), block, std::move(buf));
                    tor->on_block_received(block);
                    done = true;
                });
            EXPECT_TRUE(waitFor([&done]() { return done; }, MaxWaitMsec));
        }
    }

    static auto constexpr MaxWaitMsec = 5000;
};

TEST_F(TorrwheelTest, partialSeedMovesOnlyFinishedFiles)
{
    auto const* download_dir = tr_sessionGetDownloadDir(session_);
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);

    // file 0 lacks its first piece, files 1 and 2 are whole; all in the incomplete dir
    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));
    EXPECT_TRUE(waitForFile(tor, 1, incomplete_dir));
    EXPECT_FALSE(tor->is_done());

    // unticking the unfinished file makes the torrent done
    setFirstFileWanted(tor, false);
    EXPECT_TRUE(tor->is_partial_seed());
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitForFile(tor, 2, download_dir));
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));
    EXPECT_EQ(std::string_view{ incomplete_dir }, tor->current_dir().sv());

    // ticking it again downloads it where it is
    setFirstFileWanted(tor, true);
    EXPECT_FALSE(tor->is_done());
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));

    writeFirstPiece(tor);
    blockingTorrentVerify(tor);
    EXPECT_TRUE(waitFor([tor]() { return tor->is_seed(); }, MaxWaitMsec));

    for (tr_file_index_t i = 0, n = tr_torrentFileCount(tor); i < n; ++i)
    {
        EXPECT_TRUE(waitForFile(tor, i, download_dir));
    }
    EXPECT_EQ(std::string_view{ download_dir }, tor->current_dir().sv());

    tr_torrentRemove(tor, true, nullptr, nullptr);
}

TEST_F(TorrwheelTest, nothingMovesWhenNothingIsFinished)
{
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);
    auto const* download_dir = tr_sessionGetDownloadDir(session_);

    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    auto const files = std::array<tr_file_index_t, 3>{ 0, 1, 2 };

    // the state the stock web UI passes through: no wanted file at all
    tr_torrentSetFileDLs(tor, std::data(files), std::size(files), false);
    EXPECT_TRUE(tor->is_partial_seed());
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));

    tr_torrentRemove(tor, true, nullptr, nullptr);
}

TEST_F(TorrwheelTest, removeDeletesBothDirs)
{
    auto const* download_dir = tr_sessionGetDownloadDir(session_);
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);

    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    setFirstFileWanted(tor, false);
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));

    auto const top = std::string{ tor->name() };
    tr_torrentRemove(tor, true, nullptr, nullptr);

    auto const gone = [&]()
    {
        return !tr_sys_path_exists(tr_pathbuf{ download_dir, '/', top }) &&
            !tr_sys_path_exists(tr_pathbuf{ incomplete_dir, '/', top });
    };
    EXPECT_TRUE(waitFor(gone, MaxWaitMsec));
}

TEST_F(TorrwheelTest, setLocationMovesBothDirs)
{
    auto const* download_dir = tr_sessionGetDownloadDir(session_);
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);
    auto const target_dir = tr_pathbuf{ session_->configDir(), "/target"sv };
    tr_sys_dir_create(target_dir.c_str(), TR_SYS_DIR_CREATE_PARENTS, 0777, nullptr);

    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    setFirstFileWanted(tor, false);
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));

    auto state = -1;
    tr_torrentSetLocation(tor, target_dir, true, &state);
    EXPECT_TRUE(waitFor([&state]() { return state == TR_LOC_DONE; }, MaxWaitMsec));

    EXPECT_TRUE(waitForFile(tor, 0, target_dir, tr_torrent_files::PartialFileSuffix));
    EXPECT_TRUE(waitForFile(tor, 1, target_dir));
    EXPECT_TRUE(waitForFile(tor, 2, target_dir));

    tr_torrentRemove(tor, true, nullptr, nullptr);
}

TEST_F(TorrwheelTest, renameActsOnBothDirs)
{
    auto const* download_dir = tr_sessionGetDownloadDir(session_);
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);

    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    setFirstFileWanted(tor, false);
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));

    auto const on_rename_done =
        [](tr_torrent* /*tor*/, char const* /*oldpath*/, char const* /*newname*/, int error, void* user_data) noexcept
    {
        *static_cast<int*>(user_data) = error;
    };
    auto error = -1;
    tr_torrentRenamePath(tor, "files-filled-with-zeroes", "renamed", on_rename_done, &error);
    EXPECT_TRUE(waitFor([&error]() { return error != -1; }, MaxWaitMsec));
    EXPECT_EQ(0, error);

    EXPECT_EQ("renamed/1048576"sv, tr_torrentFile(tor, 0).name);
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitForFile(tor, 2, download_dir));

    tr_torrentRemove(tor, true, nullptr, nullptr);
}

TEST_F(TorrwheelTest, downloadDirsAreReadFromSettings)
{
    auto const& dirs = session_->settings().download_dirs;
    ASSERT_EQ(2U, std::size(dirs));
    EXPECT_EQ("/Downloads"sv, dirs[0]);
    EXPECT_EQ("/Dumps"sv, dirs[1]);
}

TEST(TorrwheelGeoip, countryOfAnAddress)
{
    // The image installs the database here; a build without it has nothing to look up.
    if (!tr_sys_path_exists("/usr/share/transmission/country.mmdb"))
    {
        GTEST_SKIP() << "no country database";
    }

    EXPECT_EQ("US"sv, torrwheel::country_of("8.8.8.8"));
    EXPECT_EQ(2U, std::size(torrwheel::country_of("2a02:6b8::feed:ff")));
    EXPECT_TRUE(std::empty(torrwheel::country_of("10.1.2.3")));
    EXPECT_TRUE(std::empty(torrwheel::country_of("not an address")));
    EXPECT_TRUE(std::empty(torrwheel::country_of(nullptr)));
}

// --- the worker that copies

namespace
{
// Records what the mover reports and lets the test wait for the end.
class RecordingMediator final : public torrwheel::Mover::Mediator
{
public:
    struct Result
    {
        std::vector<tr_file_index_t> copied;
        bool cancelled = false;
        bool failed = false;
    };

    void on_file_copied(torrwheel::Mover::File const& file) override
    {
        result_.copied.push_back(file.index);
    }

    void on_done(bool cancelled, tr_error const& error) override
    {
        result_.cancelled = cancelled;
        result_.failed = static_cast<bool>(error);
        done_.set_value(result_);
    }

    [[nodiscard]] auto future()
    {
        return done_.get_future();
    }

private:
    Result result_;
    std::promise<Result> done_;
};

[[nodiscard]] std::string read_whole_file(std::string const& path)
{
    auto in = std::ifstream{ path, std::ios::binary };
    return std::string{ std::istreambuf_iterator<char>{ in }, std::istreambuf_iterator<char>{} };
}

void write_whole_file(std::string const& path, std::string_view contents)
{
    auto out = std::ofstream{ path, std::ios::binary };
    out.write(std::data(contents), static_cast<std::streamsize>(std::size(contents)));
}
} // namespace

class TorrwheelMoverTest : public SandboxedTest
{
protected:
    [[nodiscard]] torrwheel::Mover::File makeFile(tr_file_index_t index, size_t size) const
    {
        auto const src = fmt::format("{}/src-{}", sandboxDir(), index);
        write_whole_file(src, std::string(size, static_cast<char>('a' + index)));
        return { index, src, fmt::format("{}/dst-{}", sandboxDir(), index), size };
    }

    static auto constexpr MaxWait = std::chrono::seconds{ 10 };
};

TEST_F(TorrwheelMoverTest, copiesEveryFileUnderItsTemporaryName)
{
    auto const files = std::vector<torrwheel::Mover::File>{ makeFile(0, 3U * 1024U * 1024U + 17U),
                                                            makeFile(1, 0U),
                                                            makeFile(2, 5U) };
    auto progress = std::make_shared<torrwheel::Mover::Progress>();
    auto mediator = std::make_unique<RecordingMediator>();
    auto done = mediator->future();

    auto mover = torrwheel::Mover{};
    mover.add(1, files, progress, std::move(mediator));

    ASSERT_EQ(std::future_status::ready, done.wait_for(MaxWait));
    auto const result = done.get();
    EXPECT_FALSE(result.cancelled);
    EXPECT_FALSE(result.failed);
    EXPECT_EQ((std::vector<tr_file_index_t>{ 0, 1, 2 }), result.copied);
    EXPECT_EQ(3U * 1024U * 1024U + 17U + 5U, progress->bytes_done);

    for (auto const& file : files)
    {
        // the copy is whole, and the source is not touched: putting it in place is the owner's step
        EXPECT_EQ(read_whole_file(file.src), read_whole_file(torrwheel::Mover::tmp_path(file.dst)));
        EXPECT_TRUE(tr_sys_path_exists(file.src.c_str()));
        EXPECT_FALSE(tr_sys_path_exists(file.dst.c_str()));
    }
}

TEST_F(TorrwheelMoverTest, anErrorEndsTheJobAndLeavesNoTemporaryFile)
{
    auto files = std::vector<torrwheel::Mover::File>{ makeFile(0, 100U), makeFile(1, 100U) };
    tr_sys_path_remove(files[1].src.c_str());
    auto mediator = std::make_unique<RecordingMediator>();
    auto done = mediator->future();

    auto mover = torrwheel::Mover{};
    mover.add(1, files, std::make_shared<torrwheel::Mover::Progress>(), std::move(mediator));

    ASSERT_EQ(std::future_status::ready, done.wait_for(MaxWait));
    auto const result = done.get();
    EXPECT_FALSE(result.cancelled);
    EXPECT_TRUE(result.failed);
    EXPECT_EQ((std::vector<tr_file_index_t>{ 0 }), result.copied);
    EXPECT_FALSE(tr_sys_path_exists(torrwheel::Mover::tmp_path(files[0].dst).c_str()));
    EXPECT_FALSE(tr_sys_path_exists(torrwheel::Mover::tmp_path(files[1].dst).c_str()));
    EXPECT_TRUE(tr_sys_path_exists(files[0].src.c_str()));
}

TEST_F(TorrwheelMoverTest, cancelStopsTheCopyAndWaitsForIt)
{
    // 2 MiB at 64 KiB a second would take half a minute
    auto const files = std::vector<torrwheel::Mover::File>{ makeFile(0, 2U * 1024U * 1024U) };
    auto progress = std::make_shared<torrwheel::Mover::Progress>();
    auto mediator = std::make_unique<RecordingMediator>();
    auto done = mediator->future();

    auto mover = torrwheel::Mover{ 64U * 1024U };
    mover.add(7, files, progress, std::move(mediator));
    EXPECT_TRUE(waitFor([&progress]() { return progress->bytes_done != 0U; }, MaxWait));

    mover.cancel(7);

    // cancel() returns only once the job is over
    ASSERT_EQ(std::future_status::ready, done.wait_for(std::chrono::seconds{ 0 }));
    auto const result = done.get();
    EXPECT_TRUE(result.cancelled);
    EXPECT_TRUE(std::empty(result.copied));
    EXPECT_FALSE(tr_sys_path_exists(torrwheel::Mover::tmp_path(files[0].dst).c_str()));
    EXPECT_TRUE(tr_sys_path_exists(files[0].src.c_str()));
}

TEST_F(TorrwheelMoverTest, aQueuedJobIsCancelledWithoutStarting)
{
    auto const slow = std::vector<torrwheel::Mover::File>{ makeFile(0, 2U * 1024U * 1024U) };
    auto const queued = std::vector<torrwheel::Mover::File>{ makeFile(1, 10U) };
    auto slow_mediator = std::make_unique<RecordingMediator>();
    auto queued_mediator = std::make_unique<RecordingMediator>();
    auto queued_done = queued_mediator->future();

    auto mover = torrwheel::Mover{ 64U * 1024U };
    mover.add(1, slow, std::make_shared<torrwheel::Mover::Progress>(), std::move(slow_mediator));
    mover.add(2, queued, std::make_shared<torrwheel::Mover::Progress>(), std::move(queued_mediator));
    mover.cancel(2);

    ASSERT_EQ(std::future_status::ready, queued_done.wait_for(std::chrono::seconds{ 0 }));
    EXPECT_TRUE(queued_done.get().cancelled);
    EXPECT_FALSE(tr_sys_path_exists(torrwheel::Mover::tmp_path(queued[0].dst).c_str()));
    // the destructor cancels the slow one
}

// --- a torrent whose move has to copy

class TorrwheelCopyTest : public TorrwheelTest
{
protected:
    void SetUp() override
    {
        tr_torrent::set_move_always_copies_for_testing(true);
        TorrwheelTest::SetUp();
    }

    void TearDown() override
    {
        TorrwheelTest::TearDown();
        tr_torrent::set_move_always_copies_for_testing(false);
    }

    // no copy is left half-way anywhere under the sandbox
    [[nodiscard]] bool hasTemporaryFiles(std::string_view dir) const
    {
        auto found = false;
        for (auto const& name : tr_sys_dir_get_files(dir))
        {
            auto const path = tr_pathbuf{ dir, '/', name };
            if (auto const info = tr_sys_path_get_info(path); info && info->isFolder())
            {
                found = found || hasTemporaryFiles(path.sv());
            }
            else
            {
                found = found || tr_strv_ends_with(name, torrwheel::Mover::TmpSuffix);
            }
        }
        return found;
    }
};

TEST_F(TorrwheelCopyTest, partialSeedMovesOnlyFinishedFiles)
{
    auto const* download_dir = tr_sessionGetDownloadDir(session_);
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);

    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    setFirstFileWanted(tor, false);
    EXPECT_TRUE(tor->is_partial_seed());
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitForFile(tor, 2, download_dir));
    EXPECT_TRUE(waitFor([tor]() { return !tor->is_moving(); }, MaxWaitMsec));
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));
    EXPECT_EQ(0U, tor->move_bytes_total());
    EXPECT_FALSE(hasTemporaryFiles(sandboxDir()));

    // the last file completes: it follows the others and the torrent settles in the download dir
    setFirstFileWanted(tor, true);
    writeFirstPiece(tor);
    blockingTorrentVerify(tor);
    EXPECT_TRUE(waitFor([tor]() { return tor->is_seed() && !tor->is_moving(); }, MaxWaitMsec));
    for (tr_file_index_t i = 0, n = tr_torrentFileCount(tor); i < n; ++i)
    {
        EXPECT_TRUE(waitForFile(tor, i, download_dir));
    }
    EXPECT_EQ(std::string_view{ download_dir }, tor->current_dir().sv());
    EXPECT_FALSE(tr_sys_path_exists(tr_pathbuf{ incomplete_dir, '/', tor->name() }));
    EXPECT_FALSE(hasTemporaryFiles(sandboxDir()));

    tr_torrentRemove(tor, true, nullptr, nullptr);
}

TEST_F(TorrwheelCopyTest, setLocationCopiesToAPlaceOfItsOwn)
{
    auto const* download_dir = tr_sessionGetDownloadDir(session_);
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);
    auto const target_dir = tr_pathbuf{ session_->configDir(), "/target"sv };

    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    setFirstFileWanted(tor, false);
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitFor([tor]() { return !tor->is_moving(); }, MaxWaitMsec));
    auto const top = std::string{ tor->name() };

    auto state = -1;
    tr_torrentSetLocation(tor, target_dir, true, &state);
    EXPECT_TRUE(waitFor([&state]() { return state == TR_LOC_DONE; }, MaxWaitMsec));

    EXPECT_TRUE(waitForFile(tor, 0, target_dir, tr_torrent_files::PartialFileSuffix));
    EXPECT_TRUE(waitForFile(tor, 1, target_dir));
    EXPECT_TRUE(waitForFile(tor, 2, target_dir));
    EXPECT_EQ(target_dir.sv(), tor->download_dir().sv());
    EXPECT_FALSE(tr_sys_path_exists(tr_pathbuf{ download_dir, '/', top }));
    EXPECT_FALSE(tr_sys_path_exists(tr_pathbuf{ incomplete_dir, '/', top }));
    EXPECT_FALSE(hasTemporaryFiles(sandboxDir()));

    tr_torrentRemove(tor, true, nullptr, nullptr);
}

// the same, with the copies slowed down enough to act in the middle of one
class TorrwheelSlowCopyTest : public TorrwheelCopyTest
{
protected:
    void SetUp() override
    {
        // files 1 and 2 of the zero torrent are 4096 and 512 bytes: about two seconds
        setenv("TORRWHEEL_MOVE_THROTTLE", "2048", 1);
        TorrwheelCopyTest::SetUp();
    }

    void TearDown() override
    {
        TorrwheelCopyTest::TearDown();
        unsetenv("TORRWHEEL_MOVE_THROTTLE");
    }
};

TEST_F(TorrwheelSlowCopyTest, aFileIsReadFromTheOldPlaceUntilItsCopyIsWhole)
{
    auto const* download_dir = tr_sessionGetDownloadDir(session_);
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);

    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    setFirstFileWanted(tor, false);
    // The total grows while the session thread is still listing the files: wait for both to be counted.
    ASSERT_TRUE(waitFor([tor]() { return tor->move_bytes_total() == 4096U + 512U; }, MaxWaitMsec));
    EXPECT_TRUE(tor->is_moving());
    EXPECT_LE(tor->move_bytes_done(), tor->move_bytes_total());

    // still where it was, and readable
    EXPECT_EQ(
        (tr_pathbuf{ incomplete_dir, '/', tr_torrentFile(tor, 1).name }.sv()),
        std::string_view{ tr_torrentFindFile(tor, 1) });
    auto read_result = std::atomic<int>{ -1 };
    session_->run_in_session_thread(
        [tor, &read_result]()
        {
            auto buf = std::array<uint8_t, 4096>{};
            read_result = tr_ioRead(*tor, tor->byte_loc(1048576U), std::size(buf), std::data(buf));
        });
    EXPECT_TRUE(waitFor([&read_result]() { return read_result != -1; }, MaxWaitMsec));
    EXPECT_EQ(0, read_result);

    // a check asked for now waits for the move
    tr_torrentVerify(tor);

    EXPECT_TRUE(waitFor([tor]() { return !tor->is_moving(); }, 3 * MaxWaitMsec));
    EXPECT_TRUE(waitForFile(tor, 1, download_dir));
    EXPECT_TRUE(waitForFile(tor, 2, download_dir));
    EXPECT_TRUE(waitForFile(tor, 0, incomplete_dir, tr_torrent_files::PartialFileSuffix));
    EXPECT_TRUE(waitFor([tor]() { return tr_torrentStat(tor)->activity == TR_STATUS_STOPPED; }, 3 * MaxWaitMsec));
    EXPECT_TRUE(tor->has_file(1));
    EXPECT_TRUE(tor->has_file(2));
    EXPECT_FALSE(hasTemporaryFiles(sandboxDir()));

    tr_torrentRemove(tor, true, nullptr, nullptr);
}

TEST_F(TorrwheelSlowCopyTest, removingATorrentStopsItsMove)
{
    auto const* download_dir = tr_sessionGetDownloadDir(session_);
    auto const* incomplete_dir = tr_sessionGetIncompleteDir(session_);

    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    setFirstFileWanted(tor, false);
    ASSERT_TRUE(waitFor([tor]() { return tor->is_moving(); }, MaxWaitMsec));

    auto const top = std::string{ tor->name() };
    tr_torrentRemove(tor, true, nullptr, nullptr);

    auto const gone = [&]()
    {
        return !tr_sys_path_exists(tr_pathbuf{ download_dir, '/', top }) &&
            !tr_sys_path_exists(tr_pathbuf{ incomplete_dir, '/', top });
    };
    EXPECT_TRUE(waitFor(gone, MaxWaitMsec));
    EXPECT_FALSE(hasTemporaryFiles(sandboxDir()));
}

TEST_F(TorrwheelSlowCopyTest, renamingAPathIsRefusedWhileMoving)
{
    auto* const tor = zeroTorrentInit(ZeroTorrentState::Partial);
    setFirstFileWanted(tor, false);
    ASSERT_TRUE(waitFor([tor]() { return tor->is_moving(); }, MaxWaitMsec));

    auto const on_rename_done =
        [](tr_torrent* /*tor*/, char const* /*oldpath*/, char const* /*newname*/, int error, void* user_data) noexcept
    {
        *static_cast<int*>(user_data) = error;
    };
    auto error = -1;
    tr_torrentRenamePath(tor, "files-filled-with-zeroes", "renamed", on_rename_done, &error);
    EXPECT_TRUE(waitFor([&error]() { return error != -1; }, MaxWaitMsec));
    EXPECT_EQ(EBUSY, error);

    tr_torrentRemove(tor, true, nullptr, nullptr);
}

} // namespace libtransmission::test
