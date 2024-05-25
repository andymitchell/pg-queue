Deployment
- It compares the file name (without the timestamp, e.g. '_pgq_schema')
    - If no matching file exists at the destination, or has different SQL, it deploys the file with today's timestamp (e.g. 20240522000001_pgq_schema.sql)

Rules for SQL
- You can update a file, so long as everything in it is idempotent (such that running the sql over the top of a previous version will successfully update without errors or data loss). 
    - If you can't make the update idempotent (i.e. there's a breaking change), create a new file name (e.g. '_pgq_schema_2')

Guidance for updating
- If it's an idempotent change (e.g. you're just dropping a function and replacing it with an edit)
    1. Move the existing file to _replaced
    2. Save the file with an incremented timestamp index (e.g. if the latest was 00000000000008, it'll be 00000000000009), but the same name (e.g. 00000000000009_pgq_schema.sql)
    3. Update it
    4. (FYI When it's deployed, it'll do so with today's timestamp... so the destination will have both versions for an accurate history)
- If it's non-idempotent / breaking change
    1. Create an additional file, with an incremented timestamp index (e.g. if the latest was 00000000000008, and the file was '_pgq_schema1.sql', it'll be '00000000000009_pgq_schema2.sql')

