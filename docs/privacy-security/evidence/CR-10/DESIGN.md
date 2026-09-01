# CR-10 design record

CR-10 completes self-contained recovery contracts without an operator master key. Per-user recovery remains split-custody (Drive secret plus encrypted private-key record). Disaster bundles contain ciphertext family payloads, opaque retained principals/envelopes, signed trust checkpoint metadata and independently encrypted media artifacts.

Defaults: AES-GCM media envelopes, random 96-bit nonce, 4 MiB original media limit, 512 KiB thumbnail limit, ciphertext-only manifest, checksum before decrypt, and fail-closed on tamper/wrong key. Client-side thumbnail generation and EXIF stripping remain the only safe preparation path; server-side processing of ciphertext is not assumed.

Production encrypted-only media cutover and disaster restore against a real tenant remain CR-11 gates.
