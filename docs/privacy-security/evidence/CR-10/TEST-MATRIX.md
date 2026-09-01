# CR-10 test matrix

| Area | Result |
|---|---|
| AES-GCM media artifact round-trip | Pass |
| Ciphertext does not contain media plaintext | Pass |
| Tampered ciphertext/checksum/wrong key | Fail closed |
| Ciphertext-only manifest and raw-key-shaped bundle rejection | Pass |
| Existing recovery/cutover safety regression suite | Pass locally |
