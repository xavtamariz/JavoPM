alter table public.task_events
  add column if not exists from_column_id text,
  add column if not exists to_column_id text,
  add column if not exists occurred_at timestamptz,
  add column if not exists responsible_name text,
  add column if not exists project_name text,
  add column if not exists points_snapshot numeric,
  add column if not exists folio text,
  add column if not exists metadata jsonb;

update public.task_events
set
  to_column_id = coalesce(to_column_id, column_id),
  occurred_at = coalesce(occurred_at, created_at),
  metadata = coalesce(metadata, '{}'::jsonb)
where to_column_id is null
   or occurred_at is null
   or metadata is null;

alter table public.task_events
  alter column occurred_at set default now(),
  alter column occurred_at set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

update public.task_events event
set
  responsible_name = coalesce(event.responsible_name, task.responsible_name),
  project_name = coalesce(event.project_name, task.project_name),
  points_snapshot = coalesce(event.points_snapshot, task.points),
  folio = coalesce(event.folio, task.folio),
  to_column_id = coalesce(event.to_column_id, event.column_id),
  occurred_at = coalesce(event.occurred_at, event.created_at)
from public.tasks task
where event.board_id = task.board_id
  and event.task_id = task.id
  and (
    event.responsible_name is null
    or event.project_name is null
    or event.points_snapshot is null
    or event.folio is null
    or event.to_column_id is null
    or event.occurred_at is null
  );

update public.task_events event
set
  occurred_at = task.created_at,
  metadata = coalesce(event.metadata, '{}'::jsonb) || jsonb_build_object(
    'createdAtBackfilled', true,
    'originalOccurredAt', event.occurred_at
  )
from public.tasks task
where event.board_id = task.board_id
  and event.task_id = task.id
  and event.event_type = 'created'
  and task.created_at < event.occurred_at;

insert into public.task_events (
  id,
  board_id,
  task_id,
  column_id,
  from_column_id,
  to_column_id,
  event_type,
  sort_key,
  order_index,
  client_id,
  version,
  created_at,
  updated_at,
  deleted_at,
  occurred_at,
  responsible_name,
  project_name,
  points_snapshot,
  folio,
  metadata
)
select
  'task_event_backfill_' || substring(md5(task.board_id || ':' || task.id || ':created') from 1 for 24),
  task.board_id,
  task.id,
  task.column_id,
  null,
  task.column_id,
  'created',
  '',
  0,
  task.client_id,
  1,
  task.created_at,
  now(),
  null,
  task.created_at,
  task.responsible_name,
  task.project_name,
  task.points,
  task.folio,
  jsonb_build_object('backfilled', true, 'source', 'tasks.created_at')
from public.tasks task
where task.deleted_at is null
  and not exists (
    select 1
    from public.task_events event
    where event.board_id = task.board_id
      and event.task_id = task.id
      and event.event_type = 'created'
      and event.deleted_at is null
  )
on conflict (id) do nothing;

create index if not exists task_events_board_occurred_idx
  on public.task_events (board_id, occurred_at);

create index if not exists task_events_board_task_occurred_idx
  on public.task_events (board_id, task_id, occurred_at);
