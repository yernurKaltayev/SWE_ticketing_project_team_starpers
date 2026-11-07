"""PostgreSQL index invariants for P4 canonical seat_holds design.

Run only on a disposable database whose name contains `_test` or `test_`:

    P4_TEST_DATABASE_URL=postgresql://.../ticketing_test \
        pytest backend/tests/integration/test_p4_pg_concurrency.py -q

Each test receives a private schema and tests an isolated DDL mirror of the
canonical per-seat constraint. These are NOT Alembic migration / HTTP tests.
"""
import asyncio
import os
from uuid import uuid4

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio

# Isolated schema mirror for the canonical SeatHold index. The production schema
# is built by Alembic; run an additional migration test against that schema.
DDL = """
CREATE TABLE seat_hold_groups (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL,
 user_id uuid NOT NULL,
 status text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE seat_holds (
 id uuid PRIMARY KEY,
 hold_group_id uuid NOT NULL REFERENCES seat_hold_groups(id),
 event_id uuid NOT NULL,
 seat_id uuid NOT NULL,
 ticket_type_id uuid NOT NULL,
 user_id uuid NOT NULL,
 status text NOT NULL,
 expires_at timestamptz NOT NULL,
 UNIQUE (hold_group_id, seat_id)
);
CREATE UNIQUE INDEX uq_seat_holds_event_seat_active ON seat_holds (event_id, seat_id)
 WHERE status IN ('held', 'converted');
"""

async def _connect(dsn: str, schema: str):
    import asyncpg

    conn = await asyncpg.connect(dsn)
    await conn.execute(f'SET search_path TO "{schema}"')
    return conn


@pytest_asyncio.fixture
async def pg_schema():
    dsn = os.environ.get("P4_TEST_DATABASE_URL", "")
    if not dsn:
        pytest.skip("Set P4_TEST_DATABASE_URL to a disposable PostgreSQL test DB")
    if "_test" not in dsn and "test_" not in dsn:
        pytest.fail("Refusing to run P4 DB tests on a DSN without _test or test_ in its name")
    asyncpg = pytest.importorskip("asyncpg")
    admin = await asyncpg.connect(dsn)
    schema = "p4_test_" + uuid4().hex[:14]
    try:
        await admin.execute(f'CREATE SCHEMA "{schema}"')
        conn = await _connect(dsn, schema)
        try:
            await conn.execute(DDL)
        finally:
            await conn.close()
        yield dsn, schema
    finally:
        await admin.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        await admin.close()


async def _insert_hold(conn, event_id, seat_ids, status="held"):
    hold_id = uuid4()
    await conn.execute("""
        INSERT INTO seat_hold_groups (id, event_id, user_id, status, expires_at)
        VALUES ($1, $2, $3, $4, now() + interval '10 minutes')
    """, hold_id, event_id, uuid4(), "sold" if status == "converted" else status)
    for seat_id in seat_ids:
        await conn.execute("""
            INSERT INTO seat_holds
                (id, hold_group_id, event_id, seat_id, ticket_type_id,
                 user_id, status, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '10 minutes')
        """, uuid4(), hold_id, event_id, seat_id, uuid4(), uuid4(), status)
    return hold_id


async def test_only_one_competing_hold_wins(pg_schema):
    dsn, schema = pg_schema
    import asyncpg

    event_id, seat_id = uuid4(), uuid4()
    gate = asyncio.Event()

    async def race():
        conn = await _connect(dsn, schema)
        try:
            await gate.wait()
            async with conn.transaction():
                await _insert_hold(conn, event_id, [seat_id])
            return True
        except asyncpg.UniqueViolationError:
            return False
        finally:
            await conn.close()

    runners = [asyncio.create_task(race()) for _ in range(2)]
    gate.set()
    assert sorted(await asyncio.gather(*runners)) == [False, True]


async def test_multi_seat_hold_is_atomic_on_conflict(pg_schema):
    dsn, schema = pg_schema
    import asyncpg

    conn = await _connect(dsn, schema)
    try:
        event_id, free_seat, busy_seat = uuid4(), uuid4(), uuid4()
        await _insert_hold(conn, event_id, [busy_seat])
        with pytest.raises(asyncpg.UniqueViolationError):
            async with conn.transaction():
                await _insert_hold(conn, event_id, [free_seat, busy_seat])
        assert await conn.fetchval("""
            SELECT count(*) FROM seat_holds
            WHERE event_id=$1 AND seat_id=$2
        """, event_id, free_seat) == 0
    finally:
        await conn.close()


@pytest.mark.parametrize("terminal_status", ["expired", "released"])
async def test_terminal_hold_frees_seat(pg_schema, terminal_status):
    dsn, schema = pg_schema
    conn = await _connect(dsn, schema)
    try:
        event_id, seat_id = uuid4(), uuid4()
        hold_id = await _insert_hold(conn, event_id, [seat_id])
        async with conn.transaction():
            await conn.execute("UPDATE seat_holds SET status=$1 WHERE hold_group_id=$2",
                               terminal_status, hold_id)
            await conn.execute("UPDATE seat_hold_groups SET status=$1 WHERE id=$2",
                               terminal_status, hold_id)
        await _insert_hold(conn, event_id, [seat_id])
        assert await conn.fetchval("""
            SELECT count(*) FROM seat_holds
            WHERE event_id=$1 AND seat_id=$2 AND status='held'
        """, event_id, seat_id) == 1
    finally:
        await conn.close()


async def test_sold_seat_cannot_be_reserved_again(pg_schema):
    dsn, schema = pg_schema
    import asyncpg

    conn = await _connect(dsn, schema)
    try:
        event_id, seat_id = uuid4(), uuid4()
        await _insert_hold(conn, event_id, [seat_id], status="converted")
        with pytest.raises(asyncpg.UniqueViolationError):
            await _insert_hold(conn, event_id, [seat_id])
    finally:
        await conn.close()


async def test_seat_uniqueness_is_scoped_to_event(pg_schema):
    dsn, schema = pg_schema
    conn = await _connect(dsn, schema)
    try:
        seat_id = uuid4()
        await _insert_hold(conn, uuid4(), [seat_id])
        await _insert_hold(conn, uuid4(), [seat_id])
    finally:
        await conn.close()
