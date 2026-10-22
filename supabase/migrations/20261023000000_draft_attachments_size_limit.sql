-- Cap draft attachments at the Gmail send limit (25 MB) so direct storage uploads
-- can't bypass the server-side check in saveEmailDraft.
UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE id = 'draft-attachments';
