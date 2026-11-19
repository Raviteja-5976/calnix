-- Mentions in chat. A message body stores a mention as @[Label](kind:uuid),
-- where kind is user, task, tool or prompt. People mentioned get their own
-- notification; previews and notifications show "@Label" instead of the token.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('message', 'project', 'team', 'mention'));

-- Previews (chat list and notifications) show "@Label" rather than the raw token.
create or replace function public.message_preview(p_body text, p_attachments jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when btrim(p_body) <> '' then left(
      regexp_replace(p_body, '@\[([^]\n]{1,200})\]\((user|task|tool|prompt):[0-9a-f-]{36}\)', '@\1', 'g'),
      160)
    when jsonb_array_length(p_attachments) = 1
      then 'Sent ' || coalesce(p_attachments -> 0 ->> 'name', 'a file')
    else 'Sent ' || jsonb_array_length(p_attachments) || ' files'
  end;
$$;

-- Same as before, plus: people mentioned in a group or team chat get a
-- "mentioned you" notice instead of the grouped message notice. Only members
-- of the conversation are ever notified, whatever the body claims.
create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations;
  v_preview text := public.message_preview(new.body, new.attachments);
begin
  select * into v_conv from public.conversations where id = new.conversation_id;

  if v_conv.kind <> 'dm' then
    insert into public.notifications (user_id, org_id, kind, actor_id, title, body, link)
    select cm.user_id, v_conv.org_id, 'mention', new.sender_id,
           coalesce(v_conv.name, 'Group'), v_preview, '/chat?c=' || v_conv.id
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id is distinct from new.sender_id
      and strpos(new.body, '](user:' || cm.user_id::text || ')') > 0;
  end if;

  insert into public.notifications (user_id, org_id, kind, actor_id, title, body, link, group_key)
  select cm.user_id, v_conv.org_id, 'message', new.sender_id,
         coalesce(v_conv.name, 'Direct message'), v_preview,
         '/chat?c=' || v_conv.id, 'conv:' || v_conv.id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id is distinct from new.sender_id
    and not (v_conv.kind <> 'dm' and strpos(new.body, '](user:' || cm.user_id::text || ')') > 0)
  on conflict (user_id, group_key) where read_at is null and group_key is not null
  do update set count = public.notifications.count + 1,
                body = excluded.body,
                actor_id = excluded.actor_id,
                created_at = excluded.created_at;
  return new;
end;
$$;

-- Opening a conversation clears its mentions as well as its message notice.
create or replace function public.mark_conversation_read(p_conversation uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid();
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null
    and (group_key = 'conv:' || p_conversation
         or (kind = 'mention' and link = '/chat?c=' || p_conversation));
$$;
