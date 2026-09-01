# CR-10 failure injection

- Wrong key: `MEDIA_DECRYPT_FAILED`.
- Modified ciphertext or checksum: `MEDIA_TAMPERED`.
- Invalid media ID, MIME or size: `INVALID_MEDIA_ARTIFACT`.
- Manifest with `ciphertextOnly=false` or raw-key-shaped payload: `INVALID_DISASTER_BUNDLE`.
- Missing recovery custody or provider purge evidence: CR-11 stop condition; no Production cutover.
