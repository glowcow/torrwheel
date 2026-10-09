// torrwheel: the country an address is in, read from an MMDB file.
// License text can be found in the licenses/ folder.

#include <string>

#ifdef WITH_MAXMINDDB
#include <maxminddb.h>
#endif

#include "libtransmission/transmission.h"

#include "libtransmission/torrwheel-geoip.h"
#include "libtransmission/utils.h"

namespace torrwheel
{
#ifdef WITH_MAXMINDDB
namespace
{
// Opened once and kept: lookups only read the mapped file.
struct Db
{
    Db()
    {
        auto path = tr_env_get_string("TORRWHEEL_COUNTRY_DB");
        if (std::empty(path))
        {
            path = TORRWHEEL_COUNTRY_DB;
        }

        is_open = MMDB_open(path.c_str(), MMDB_MODE_MMAP, &mmdb) == MMDB_SUCCESS;
    }

    ~Db()
    {
        if (is_open)
        {
            MMDB_close(&mmdb);
        }
    }

    Db(Db const&) = delete;
    Db& operator=(Db const&) = delete;

    MMDB_s mmdb = {};
    bool is_open = false;
};
} // namespace

std::string country_of(char const* address)
{
    static auto const db = Db{};
    if (!db.is_open || address == nullptr)
    {
        return {};
    }

    auto gai_error = 0;
    auto mmdb_error = 0;
    auto result = MMDB_lookup_string(&db.mmdb, address, &gai_error, &mmdb_error);
    if (gai_error != 0 || mmdb_error != MMDB_SUCCESS || !result.found_entry)
    {
        return {};
    }

    auto data = MMDB_entry_data_s{};
    if (MMDB_get_value(&result.entry, &data, "country", "iso_code", nullptr) != MMDB_SUCCESS || !data.has_data ||
        data.type != MMDB_DATA_TYPE_UTF8_STRING)
    {
        return {};
    }

    return std::string{ data.utf8_string, data.data_size };
}
#else
std::string country_of(char const* /*address*/)
{
    return {};
}
#endif
} // namespace torrwheel
