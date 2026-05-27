-- JavoPM v1.9.0 cloud chat.
-- Chat is cloud-only and uses Supabase Realtime, RLS, Edge Functions, and private Storage.

create schema if not exists private;

create table if not exists public.chat_conversations (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  type text not null check (type in ('general', 'direct', 'group')),
  title text not null default '',
  direct_key text,
  created_by uuid references auth.users(id) on delete set null,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists chat_conversations_direct_key_unique
  on public.chat_conversations (board_id, direct_key)
  where direct_key is not null and deleted_at is null;

create unique index if not exists chat_conversations_general_unique
  on public.chat_conversations (board_id)
  where type = 'general' and deleted_at is null;

create index if not exists chat_conversations_board_updated_idx
  on public.chat_conversations (board_id, updated_at desc);

create index if not exists chat_conversations_workspace_idx
  on public.chat_conversations (workspace_id);

create index if not exists chat_conversations_created_by_idx
  on public.chat_conversations (created_by)
  where created_by is not null;

create table if not exists public.chat_participants (
  id text primary key,
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_member_id text references public.team_members(id) on delete set null,
  nickname_snapshot text not null default '',
  is_active boolean not null default true,
  last_read_at timestamptz,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (conversation_id, user_id)
);

create index if not exists chat_participants_conversation_idx
  on public.chat_participants (conversation_id, is_active);

create index if not exists chat_participants_user_board_idx
  on public.chat_participants (user_id, board_id, is_active);

create index if not exists chat_participants_board_idx
  on public.chat_participants (board_id);

create index if not exists chat_participants_workspace_idx
  on public.chat_participants (workspace_id);

create index if not exists chat_participants_team_member_idx
  on public.chat_participants (team_member_id)
  where team_member_id is not null;

create table if not exists public.chat_messages (
  id text primary key,
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_team_member_id text references public.team_members(id) on delete set null,
  sender_nickname_snapshot text not null default '',
  body text not null default '',
  message_type text not null default 'text' check (message_type in ('text', 'image', 'mixed')),
  metadata jsonb not null default '{}'::jsonb,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

create index if not exists chat_messages_board_created_idx
  on public.chat_messages (board_id, created_at desc);

create index if not exists chat_messages_workspace_idx
  on public.chat_messages (workspace_id);

create index if not exists chat_messages_sender_user_idx
  on public.chat_messages (sender_user_id);

create index if not exists chat_messages_sender_team_member_idx
  on public.chat_messages (sender_team_member_id)
  where sender_team_member_id is not null;

create table if not exists public.chat_attachments (
  id text primary key,
  message_id text not null references public.chat_messages(id) on delete cascade,
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  storage_path text not null,
  file_name text not null default '',
  mime_type text not null,
  size_bytes integer not null default 0,
  width integer,
  height integer,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists chat_attachments_message_idx
  on public.chat_attachments (message_id);

create index if not exists chat_attachments_conversation_idx
  on public.chat_attachments (conversation_id);

create index if not exists chat_attachments_board_idx
  on public.chat_attachments (board_id);

create index if not exists chat_attachments_workspace_idx
  on public.chat_attachments (workspace_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'chat_conversations',
    'chat_participants',
    'chat_messages',
    'chat_attachments'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create or replace function private.is_chat_participant(p_conversation_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_participants cp
    join public.chat_conversations cc on cc.id = cp.conversation_id
    join public.workspace_members wm on wm.workspace_id = cc.workspace_id
    where cp.conversation_id = p_conversation_id
      and cp.user_id = auth.uid()
      and cp.is_active
      and cp.deleted_at is null
      and cc.deleted_at is null
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.deleted_at is null
  );
$$;

create or replace function private.can_view_chat_conversation(p_conversation_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_conversations cc
    where cc.id = p_conversation_id
      and cc.deleted_at is null
      and (
        private.is_chat_participant(cc.id)
        or (
          cc.type = 'group'
          and cc.created_by = auth.uid()
          and private.is_workspace_member(cc.workspace_id)
        )
      )
  );
$$;

create or replace function private.can_read_chat_message(p_message_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_messages cm
    where cm.id = p_message_id
      and cm.deleted_at is null
      and private.is_chat_participant(cm.conversation_id)
  );
$$;

grant execute on function private.is_chat_participant(text) to authenticated;
grant execute on function private.can_view_chat_conversation(text) to authenticated;
grant execute on function private.can_read_chat_message(text) to authenticated;

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_attachments enable row level security;

drop policy if exists "chat conversations visible to participants or creator" on public.chat_conversations;
drop policy if exists "chat conversations insert by board members" on public.chat_conversations;
drop policy if exists "chat conversations update by participants or owner" on public.chat_conversations;
drop policy if exists "chat participants visible to conversation viewers" on public.chat_participants;
drop policy if exists "chat participants update own read state" on public.chat_participants;
drop policy if exists "chat messages visible to participants" on public.chat_messages;
drop policy if exists "chat messages insert by participants" on public.chat_messages;
drop policy if exists "chat attachments visible to participants" on public.chat_attachments;
drop policy if exists "chat attachments insert by participants" on public.chat_attachments;

create policy "chat conversations visible to participants or creator"
on public.chat_conversations
for select
to authenticated
using (private.can_view_chat_conversation(id));

create policy "chat conversations insert by board members"
on public.chat_conversations
for insert
to authenticated
with check (private.is_board_member(board_id));

create policy "chat conversations update by participants or owner"
on public.chat_conversations
for update
to authenticated
using (
  private.is_chat_participant(id)
  or (created_by = (select auth.uid()) and private.is_workspace_member(workspace_id))
)
with check (
  private.is_chat_participant(id)
  or (created_by = (select auth.uid()) and private.is_workspace_member(workspace_id))
);

create policy "chat participants visible to conversation viewers"
on public.chat_participants
for select
to authenticated
using (private.can_view_chat_conversation(conversation_id));

create policy "chat participants update own read state"
on public.chat_participants
for update
to authenticated
using (user_id = (select auth.uid()) and private.is_chat_participant(conversation_id))
with check (user_id = (select auth.uid()) and private.is_chat_participant(conversation_id));

create policy "chat messages visible to participants"
on public.chat_messages
for select
to authenticated
using (private.is_chat_participant(conversation_id));

create policy "chat messages insert by participants"
on public.chat_messages
for insert
to authenticated
with check (
  sender_user_id = (select auth.uid())
  and private.is_chat_participant(conversation_id)
  and private.is_board_member(board_id)
);

create policy "chat attachments visible to participants"
on public.chat_attachments
for select
to authenticated
using (private.is_chat_participant(conversation_id));

create policy "chat attachments insert by participants"
on public.chat_attachments
for insert
to authenticated
with check (
  private.is_chat_participant(conversation_id)
  and private.can_read_chat_message(message_id)
);

grant select, insert, update on public.chat_conversations to authenticated;
grant select, insert, update on public.chat_participants to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select, insert on public.chat_attachments to authenticated;
grant all on public.chat_conversations to service_role;
grant all on public.chat_participants to service_role;
grant all on public.chat_messages to service_role;
grant all on public.chat_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "chat images readable by participants" on storage.objects;
drop policy if exists "chat images uploadable by participants" on storage.objects;

create policy "chat images readable by participants"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-images'
  and private.is_chat_participant((storage.foldername(name))[3])
);

create policy "chat images uploadable by participants"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-images'
  and owner = (select auth.uid())
  and private.is_chat_participant((storage.foldername(name))[3])
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'chat_conversations',
    'chat_participants',
    'chat_messages',
    'chat_attachments'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception
      when duplicate_object then null;
    end;
  end loop;
end;
$$;
