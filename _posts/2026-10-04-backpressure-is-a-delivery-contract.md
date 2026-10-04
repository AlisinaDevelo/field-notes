---
title: Backpressure is a delivery contract.
date: 2026-10-04 12:00:00 +0200
sequence: 3
code: SYS
topic: Realtime systems
series: Systems
project_name: Chatster
project_url: https://github.com/AlisinaDevelo/Chatster
project_description: Go WebSocket chat with room history, bounded outbound queues, and optional Redis fan-out.
source_label: Go / WebSocket
reading_time: 12
discussion_number: 3
description: Inside Chatster's queue ownership, slow-client eviction, live-versus-durable message path, and the arithmetic behind a broadcast benchmark.
---

A chat server can accept a message, save it, queue it, write it to a socket, and still have no evidence that another person read it. Each verb crosses a different boundary. The difficult part of realtime delivery is making those boundaries precise enough that overload does not quietly change their meaning.

In [Chatster](https://github.com/AlisinaDevelo/Chatster), the central decision is a small one: every connected client gets a bounded outbound queue. The hub places messages in that queue without waiting for the client's socket. A writer drains it. When the queue fills during live fan-out, the hub disconnects that client.

That arrangement defines an observable policy: a sufficiently slow recipient loses its live connection. Understanding the policy requires following ownership, persistence, replay, and measurement through the same implementation.

This note follows public revision [`f366291`](https://github.com/AlisinaDevelo/Chatster/tree/f36629133619d6c74ad975ef9ecda56635ab8c96). The benchmark numbers below are recorded repository results, with their original conditions; they were not rerun for this article.

## Give the socket one data writer

A WebSocket connection is a bidirectional stream with framing rules. Concurrent goroutines cannot safely treat its data writes as independent packets. Gorilla's contract permits one concurrent reader and one concurrent writer; `Close` and `WriteControl` have an explicit concurrency exception. See the [library's concurrency documentation](https://pkg.go.dev/github.com/gorilla/websocket#hdr-Concurrency).

Chatster separates message production from the actual data write. Live broadcasts, history replay, and notices call `enqueue`. The client's `writeMessages` goroutine drains `send` and calls `writeJSON`. A `writeMu` also serializes the data write and the ordinary heartbeat control path. The data write sets a ten-second deadline before calling `Conn.WriteJSON`. These are concrete ownership rules in [`client.go`](https://github.com/AlisinaDevelo/Chatster/blob/f36629133619d6c74ad975ef9ecda56635ab8c96/backend/client.go).

<figure>
  <svg viewBox="0 0 620 255" role="img" aria-labelledby="queue-title queue-desc">
    <title id="queue-title">Chatster separates hub fan-out from socket writes</title>
    <desc id="queue-desc">A shared broadcast queue feeds the hub. The hub offers messages to a fast and a slow client's bounded queues. Each client has its own data writer. A full queue causes that client's eviction.</desc>
    <defs><marker id="queue-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" fill="#31488f"/></marker></defs>
    <g font-family="monospace" font-size="11" fill="#20241f">
      <rect x="10" y="95" width="130" height="64" fill="#f8f7f1" stroke="#a8afa4"/><text x="75" y="120" text-anchor="middle">broadcast</text><text x="75" y="139" text-anchor="middle" font-size="10" fill="#69716a">1,024 slots</text>
      <rect x="177" y="95" width="92" height="64" fill="#d1ed62" stroke="#20241f"/><text x="223" y="120" text-anchor="middle">hub</text><text x="223" y="139" text-anchor="middle" font-size="10">room filter</text>
      <rect x="314" y="30" width="136" height="64" fill="#f8f7f1" stroke="#a8afa4"/><text x="382" y="55" text-anchor="middle">client A queue</text><text x="382" y="74" text-anchor="middle" font-size="10" fill="#69716a">256 slots</text>
      <rect x="314" y="157" width="136" height="64" fill="#f8f7f1" stroke="#a8afa4"/><text x="382" y="182" text-anchor="middle">client B queue</text><text x="382" y="201" text-anchor="middle" font-size="10" fill="#69716a">full → disconnect</text>
      <rect x="493" y="30" width="117" height="64" fill="#f8f7f1" stroke="#a8afa4"/><text x="551" y="55" text-anchor="middle">writer A</text><text x="551" y="74" text-anchor="middle" font-size="10" fill="#69716a">socket A</text>
      <rect x="493" y="157" width="117" height="64" fill="#f8f7f1" stroke="#a8afa4"/><text x="551" y="182" text-anchor="middle">writer B</text><text x="551" y="201" text-anchor="middle" font-size="10" fill="#69716a">socket B</text>
      <path d="M140 127h32M269 127h20v-65h20M289 127v62h20M450 62h38M450 189h38" fill="none" stroke="#31488f" stroke-width="1.5" marker-end="url(#queue-arrow)"/>
    </g>
  </svg>
  <figcaption>The hub offers work to bounded queues. Socket latency belongs to each client's writer.</figcaption>
</figure>

The hub still holds its membership mutex while iterating clients, checking room membership, and offering a message. It avoids ordinary JSON socket writes in that loop, but the loop itself still costs CPU and holds a shared lock. Queueing moves a source of unpredictable waiting; it does not make the shared work disappear.

## A full queue chooses who pays

The outbound queue has 256 slots. Its offer operation is short enough to inspect in full:

```go
func (c *Client) enqueue(message Message) bool {
    select {
    case <-c.done:
        return false
    default:
    }

    select {
    case c.send <- message:
        return true
    case <-c.done:
        return false
    default:
        return false
    }
}
```

The final `default` is the overload policy. When no slot is available, this call returns immediately. In the hub's live broadcast branch, `false` increments the `slow_client` outbound-drop metric, removes the client from membership, and closes it. The same return value also covers an already closing client, so that metric's label is broader than a proof of network slowness. The [caller in `hub.go`](https://github.com/AlisinaDevelo/Chatster/blob/f36629133619d6c74ad975ef9ecda56635ab8c96/backend/hub.go) supplies the meaning that a boolean alone cannot.

Other call sites have different consequences. A failed history enqueue logs a warning and ends replay; it does not directly evict the client there. A failed notice enqueue logs a warning. “The queue is bounded” describes a mechanism. To understand the contract, read what each producer does when its offer fails.

There are several defensible policies for a full recipient queue:

- Block the publisher and propagate the recipient's delay to other work.
- Drop a message while keeping the connection, ideally exposing an explicit gap.
- Coalesce replaceable state, such as a cursor position or presence snapshot.
- Disconnect and require the recipient to recover through history.

Chat messages are generally not replaceable snapshots. Chatster chooses the last policy for live fan-out. That protects other recipients from waiting on the slow socket, while making recovery an application concern.

### The buffer buys time

Let `λ` be arrivals to one recipient queue, `μ` its writer's drain rate, `B` the capacity, and `q₀` the current occupancy. During a sustained interval with `λ > μ`, a simple fluid approximation gives:

```text
queue growth ≈ λ − μ
time to full ≈ (B − q₀) / (λ − μ)
```

For a hypothetical empty 256-slot queue receiving 1,000 messages per second while its writer drains 800, the budget lasts roughly `256 / 200 = 1.28 seconds`. This is arithmetic, not a measured Chatster operating point. Bursts, scheduling, variable frame sizes, and stalled writes make actual occupancy less smooth.

Increasing the buffer doubles the time before this particular overload becomes visible. It also permits a larger backlog and consumes more memory. At sustained excess arrival rate, every finite buffer eventually fills. If delivery latency matters, a queue's age is as informative as its depth: 200 old messages and 200 just-arrived messages imply different user experiences.

The shared hub queue has a different policy. Its capacity is 1,024, and `publishContext` waits for a slot or for the hub's `done` signal. Its parent context is used for tracing; the channel select does not use that parent's cancellation as an enqueue deadline. A saturated shared queue therefore propagates pressure back to publishers. Capacity determines where waiting begins; each select determines how waiting ends.

## Close the lifecycle signal once

Multiple producers can enqueue to one client's queue. Closing `send` from a disconnect path would create a dangerous ownership question: which producer can prove every other sender has finished? A send to a closed Go channel panics, including inside a select.

Chatster leaves `send` unclosed and closes a separate `done` channel through `sync.Once`. Producers check `done`, the writer checks `done`, and the connection is closed. The lifecycle signal has one idempotent close operation even when a read error, a write error, slow-client eviction, and shutdown overlap.

The double select is not an atomic guarantee that no message can enter the queue after closure begins. If `done` closes between the first check and the second select, both a send and the done case may be ready; a select can choose either. The meaningful guarantee is that closure can stop the consumer and remove the connection from active membership without sending into a closed `send` channel. An accepted queue offer is consequently weaker than completed delivery.

Shutdown makes that distinction visible. The hub stops accepting registrations, snapshots clients, attempts a service-restart close frame, closes sockets, and waits for bounded lifecycle cleanup. The close control write has a 250-millisecond deadline and uses Gorilla's concurrency exception directly. This path is not a promise to flush all 256 queued messages before exit. The [shutdown code](https://github.com/AlisinaDevelo/Chatster/blob/f36629133619d6c74ad975ef9ecda56635ab8c96/backend/hub.go) bounds teardown, which is a different objective from draining application delivery.

## Follow one message through persistence

The reader validates the body, applies the rate limit, and binds room and identity from server state. It then attempts storage before publishing. The important branch is what happens when storage fails:

```go
dbMsg, err := saveMessageObservedForUserInRoomContext(
    c.traceContext(), c.Hub.database,
    msg.Room, msg.UserID, msg.Username, msg.Content, msg.Type,
)
if err != nil {
    slog.Warn("save message", "err", err)
} else {
    msg.ID = dbMsg.ID
    msg.Timestamp = dbMsg.Timestamp
}

metrics.MessagesIngested.Inc()
if !c.Hub.publishContext(c.traceContext(), msg) {
    return
}
```

This [current implementation](https://github.com/AlisinaDevelo/Chatster/blob/f36629133619d6c74ad975ef9ecda56635ab8c96/backend/client.go) can publish a live message after a failed database write. A recipient can see it now and fail to find it in history later. The ingest counter includes that message; it is not a durable-message receipt.

The optional Redis path adds another boundary. `queueBrokerMessage` requires a positive message ID and a nonzero timestamp, which successful saves normally supply. It refuses a message without those fields and records `not_persisted`. If a failed save leaves those fields empty, local live delivery can occur without Redis fan-out or a replayable record. A saved message can still lose its Redis event if the broker publisher queue is full; that path records `publish_backpressure`.

For a contract that promises persistence before acceptance, a failed save would need to reject the send or issue an explicit negative acknowledgement. For durable cross-instance fan-out, the database record and an outbox event could be committed together, with retryable publication afterward. Those are possible extensions, not properties of this revision. They also require clients to handle acknowledgements, retries, and duplicate event IDs deliberately.

## Reconnect needs a history boundary

On connection, Chatster starts asynchronous replay of the latest 50 room messages. The SQLite repository selects by descending timestamp and ID and reverses the returned slice for replay. Older messages are available through cursor history. The replay producer and the live hub both enqueue into the same client's outbound queue. See [`sendMessageHistory`](https://github.com/AlisinaDevelo/Chatster/blob/f36629133619d6c74ad975ef9ecda56635ab8c96/backend/hub.go) and the [SQLite history query](https://github.com/AlisinaDevelo/Chatster/blob/f36629133619d6c74ad975ef9ecda56635ab8c96/backend/db/database.go).

A serialized socket writer preserves the order in which messages enter its queue. It cannot invent an atomic handoff between an asynchronous database query and concurrently arriving live events. Nor does a last-50 window establish that a client disconnected long enough has recovered every missed message.

Consider this conceptual timeline:

```text
client registers
  ├─ history query begins
  ├─ a new live message enters send
  └─ history rows enter send afterward
```

The displayed order can contain a new live event before older replay. A live event that falls into the query's view may also overlap with replay, depending on timing. The current queue is a transport-order boundary, not a transactionally pinned history boundary.

A stronger reconnect design would define a persisted cursor, snapshot history through a watermark, buffer live events during replay, deduplicate by stable message ID, and release events after the watermark in order. That design has its own capacity and timeout policy. Without those steps, “reconnect for history” should be read as bounded recent replay, not gap-free stream resumption.

## Count broadcast work in the right units

For a room with `N` connected recipients, one message requires `N` queue offers. This implementation iterates the entire client map and filters by room, so its scan is proportional to all connected clients even when fewer receive that message.

If all `N` clients are in one room and each sends `M` messages, total expected deliveries are:

```text
input messages = M × N
recipient deliveries = M × N × N
```

The quadratic term belongs to that whole workload. Per-message fan-out remains linear in recipient count. At 25 clients and 20 messages each, 500 input messages imply 12,500 deliveries. At 50 clients, 1,000 inputs imply 50,000 deliveries. Doubling this benchmark's clients quadruples delivery work because it doubles senders and recipients together.

The [recorded load results](https://github.com/AlisinaDevelo/Chatster/blob/f36629133619d6c74ad975ef9ecda56635ab8c96/docs/LOAD_TESTING.md) use an Apple M1 with eight cores, macOS 26.5.1, Go 1.26.3, and a fresh SQLite database per run, on 24 June 2026. Both rate limiters were disabled. Each client sent 20 messages, paced five milliseconds apart, after a one-second settle period.

<div class="table-viewport" role="region" aria-label="Recorded Chatster broadcast measurements" tabindex="0" markdown="1">

| Clients | Delivered / expected | Deliveries per second | p50 | p99 |
| ---: | ---: | ---: | ---: | ---: |
| 25 | 12,500 / 12,500 | ~121,000 | 2.2 ms | 5.7 ms |
| 50 | 50,000 / 50,000 | ~314,000 | 22 ms | 57 ms |

</div>

The 25-client row is a representative single run; the 50-client row is the median of five runs. Delivery throughput uses the interval from first send to last in-scope delivery. It is neither input-message throughput nor the speed of writing into a local client buffer.

The harness counts unique `(sender, sequence)` messages per recipient, which prevents replay from inflating delivery counts. A fresh database also prevents old benchmark timestamps from entering a new latency distribution. The settle period reduces startup races, but a timed grace period is still weaker than an explicit all-clients-registered barrier.

The repository reports unstable delivery shortfalls in larger runs, with zero outbound-drop counts in the cited 100-client experiments. That observation does not identify the failed stage. It certainly does not prove the 256-slot policy caused every missing delivery. Sender aborts, registration, persistence, scheduling, socket reads, and the measurement window all need their own evidence. A zero queue-drop counter narrows one hypothesis; it is not an end-to-end receipt.

## Reproduce a delivery experiment

With the pinned checkout and the backend's Go toolchain available, start a fresh local backend in one terminal. The SQLite driver also needs a working C toolchain. These settings intentionally disable the demo's rate limits for the experiment:

```sh
git clone https://github.com/AlisinaDevelo/Chatster.git
cd Chatster
git checkout f36629133619d6c74ad975ef9ecda56635ab8c96
cd backend
run_dir="$(mktemp -d)"
CHATSTER_DB_PATH="$run_dir/history.sqlite3" \
CHATSTER_MESSAGE_RPS=0 \
CHATSTER_WS_UPGRADE_RPS=0 \
go run .
```

In a second terminal, from the same checkout's `backend` directory:

```sh
go run ./cmd/wsload \
  -url 'ws://127.0.0.1:8080/ws?room=general' \
  -clients 25 \
  -messages 20 \
  -settle-for 1s \
  -send-interval 5ms \
  -drain-for 6s \
  -fail-on-loss
```

Read `total_sent`, `expected_delivered`, `delivered`, `lost`, and latency together. Keep the JSON, commit, command, machine, and date. A repeated run against the same database is a different history condition; create a fresh one when comparing the documented experiment. More load can reveal a limit, but a percentile alone cannot tell you whether the missing messages were rejected, never written, never read, or outside the observation window.

The queue's real value is that it makes one overload response inspectable. After that, the engineering work is to connect the rest of the receipts: persisted record, hub offer, socket completion, replay cursor, and recipient acknowledgement. Every stronger delivery promise needs a place where the implementation actually earns it.
