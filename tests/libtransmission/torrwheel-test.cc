// torrwheel: tests of the fork's own file placement rules.
// License text can be found in the licenses/ folder.

#include <algorithm>
#include <array>
#include <memory>
#include <string>
#include <string_view>

#include <libtransmission/transmission.h>

#include <libtransmission/block-info.h>
#include <libtransmission/cache.h> // tr_cacheWriteBlock()
#include <libtransmission/file.h> // tr_sys_path_*()
#include <libtransmission/quark.h>
#include <libtransmission/torrent.h>
#include <libtransmission/torrent-files.h>
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

} // namespace libtransmission::test
