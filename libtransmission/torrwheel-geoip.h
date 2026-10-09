// torrwheel: the country an address is in, read from an MMDB file.
// License text can be found in the licenses/ folder.

#pragma once

#ifndef __TRANSMISSION__
#error only libtransmission should #include this header.
#endif

#include <string>

namespace torrwheel
{
// Two-letter ISO code, or empty: no database, a private address, or no entry.
[[nodiscard]] std::string country_of(char const* address);
} // namespace torrwheel
