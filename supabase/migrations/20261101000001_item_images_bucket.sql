-- Private bucket for AI images. It has no storage policies on purpose, so only the
-- server's secret key can read or write it. Viewers get a short-lived signed link
-- from /api/items/:id/image after the app checks that they may see the item.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', false, 10485760, array['image/webp']);
