import { expect, it } from "@effect/vitest";
import {
  type CanonicalItemType,
  EventId,
  ProviderDriverKind,
  type ProviderRuntimeEvent,
  RuntimeItemId,
  TOOL_LIFECYCLE_ITEM_TYPES,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Scope from "effect/Scope";
import { TestClock } from "effect/testing";

import { makeCumulativeToolCallUpdateCoalescer } from "./CumulativeToolCallUpdateCoalescer.ts";

let nextEventId = 0;

function eventStamp() {
  nextEventId += 1;
  return {
    eventId: EventId.make(`event-${nextEventId}`),
    createdAt: "2026-07-16T00:00:00.000Z",
  };
}

function partial(input: {
  readonly detail: string;
  readonly dataMarker?: number;
  readonly itemType?: CanonicalItemType;
  readonly provider?: string;
  readonly rawMarker?: number;
  readonly status?: "inProgress" | "completed" | "failed" | "declined" | undefined;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly itemId?: string;
  readonly title?: string;
}): ProviderRuntimeEvent {
  return {
    type: "item.updated",
    ...eventStamp(),
    provider: ProviderDriverKind.make(input.provider ?? "kimi"),
    threadId: ThreadId.make(input.threadId ?? "thread-1"),
    turnId: TurnId.make(input.turnId ?? "turn-1"),
    itemId: RuntimeItemId.make(input.itemId ?? "tool-1"),
    payload: {
      itemType: input.itemType ?? "dynamic_tool_call",
      status: Object.hasOwn(input, "status") ? input.status : "inProgress",
      title: input.title ?? "Tool",
      detail: input.detail,
      data: { rawInput: input.detail, marker: input.dataMarker },
    },
    raw: {
      source: "acp.jsonrpc",
      method: "session/update",
      payload: { detail: input.detail, marker: input.rawMarker },
    },
  };
}

function terminal(input: {
  readonly detail: string;
  readonly itemType?: CanonicalItemType;
  readonly marker?: number;
}): ProviderRuntimeEvent {
  return {
    type: "item.completed",
    ...eventStamp(),
    provider: ProviderDriverKind.make("kimi"),
    threadId: ThreadId.make("thread-1"),
    turnId: TurnId.make("turn-1"),
    itemId: RuntimeItemId.make("tool-1"),
    payload: {
      itemType: input.itemType ?? "dynamic_tool_call",
      status: "completed",
      title: "Tool",
      detail: input.detail,
      data: { rawInput: input.detail, marker: input.marker, result: "done" },
    },
    raw: {
      source: "acp.jsonrpc",
      method: "session/update",
      payload: { detail: input.detail, marker: input.marker, status: "completed" },
    },
  };
}

const makeHarness = Effect.fn("makeCumulativeToolCallUpdateCoalescerTestHarness")(function* () {
  const scope = yield* Scope.Scope;
  const published: Array<ProviderRuntimeEvent> = [];
  const coalescer = yield* makeCumulativeToolCallUpdateCoalescer({
    scope,
    interval: "100 millis",
    publish: (event) =>
      Effect.sync(() => {
        published.push(event);
      }),
  });
  return { coalescer, published };
});

it.effect("bounds canonical writes while retaining the newest cumulative partial", () =>
  Effect.gen(function* () {
    const { coalescer, published } = yield* makeHarness();
    let firstNewest: ProviderRuntimeEvent | undefined;

    for (let index = 1; index <= 250; index += 1) {
      firstNewest = partial({
        detail: "x".repeat(index),
        dataMarker: index,
        itemType: "file_change",
        rawMarker: index,
      });
      yield* coalescer.offer(firstNewest);
    }
    expect(published).toHaveLength(0);

    yield* TestClock.adjust("100 millis");
    yield* Effect.yieldNow;
    expect(published).toHaveLength(1);
    const firstPublished = published[0];
    expect(firstPublished?.type).toBe("item.updated");
    if (firstPublished?.type === "item.updated") {
      expect(firstPublished.payload.detail).toBe("x".repeat(250));
      expect(firstPublished.payload.data).toEqual({ rawInput: "x".repeat(250), marker: 250 });
      expect(firstPublished.raw?.payload).toEqual({ detail: "x".repeat(250), marker: 250 });
    }
    expect(firstPublished).toEqual(firstNewest);

    let secondNewest: ProviderRuntimeEvent | undefined;
    for (let index = 251; index <= 500; index += 1) {
      secondNewest = partial({
        detail: "x".repeat(index),
        dataMarker: index,
        itemType: "file_change",
        rawMarker: index,
      });
      yield* coalescer.offer(secondNewest);
    }
    yield* TestClock.adjust("100 millis");
    yield* Effect.yieldNow;

    expect(published).toHaveLength(2);
    const secondPublished = published[1];
    expect(secondPublished?.type).toBe("item.updated");
    if (secondPublished?.type === "item.updated") {
      expect(secondPublished.payload.detail).toBe("x".repeat(500));
    }
    expect(secondPublished).toEqual(secondNewest);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect("coalesces every contract-defined tool lifecycle item type", () =>
  Effect.gen(function* () {
    const { coalescer, published } = yield* makeHarness();
    const expected: Array<ProviderRuntimeEvent> = [];

    for (const itemType of TOOL_LIFECYCLE_ITEM_TYPES) {
      yield* coalescer.offer(partial({ detail: "a", itemType }));
      const newest = partial({ detail: "ab", itemType });
      expected.push(newest);
      yield* coalescer.offer(newest);
      yield* coalescer.flush;
    }

    expect(published).toEqual(expected);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect("treats title and nonterminal status changes as coalescing boundaries", () =>
  Effect.gen(function* () {
    const { coalescer, published } = yield* makeHarness();
    const first = partial({ detail: "a", title: "First title" });
    const nextTitle = partial({ detail: "ab", title: "Second title" });
    const nextStatus = partial({ detail: "abc", status: undefined, title: "Second title" });

    yield* coalescer.offer(first);
    yield* coalescer.offer(nextTitle);
    expect(published).toEqual([first]);

    yield* coalescer.offer(nextStatus);
    expect(published).toEqual([first, nextTitle]);

    yield* coalescer.flush;
    expect(published).toEqual([first, nextTitle, nextStatus]);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect("publishes an exact terminal event immediately and cancels its pending timer", () =>
  Effect.gen(function* () {
    const { coalescer, published } = yield* makeHarness();
    const finalDetail = '{"path":"C:/final","ok":true}';
    const latestPartial = partial({ detail: finalDetail, itemType: "file_change", rawMarker: 3 });
    const exactFinal = terminal({ detail: finalDetail, itemType: "file_change", marker: 4 });

    yield* coalescer.offer(partial({ detail: "{", itemType: "file_change" }));
    yield* coalescer.offer(partial({ detail: '{"path"', itemType: "file_change" }));
    yield* coalescer.offer(latestPartial);
    yield* coalescer.offer(exactFinal);

    expect(published).toEqual([latestPartial, exactFinal]);
    yield* TestClock.adjust("1 second");
    yield* Effect.yieldNow;
    expect(published).toEqual([latestPartial, exactFinal]);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect(
  "preserves ordering and isolates providers, threads, turns, items, item types, and resets",
  () =>
    Effect.gen(function* () {
      const { coalescer, published } = yield* makeHarness();
      const firstLatest = partial({ detail: "abc", itemId: "tool-1" });
      const secondItem = partial({ detail: "one", itemId: "tool-2" });
      const secondItemReset = partial({ detail: "reset", itemId: "tool-2" });
      const nextTurn = partial({ detail: "next", itemId: "tool-2", turnId: "turn-2" });
      const nextThread = partial({
        detail: "thread",
        itemId: "tool-2",
        turnId: "turn-2",
        threadId: "thread-2",
      });
      const nextProvider = partial({
        detail: "provider",
        provider: "other",
        itemId: "tool-2",
        turnId: "turn-2",
        threadId: "thread-2",
      });
      const nextItemType = partial({
        detail: "item-type",
        provider: "other",
        itemId: "tool-2",
        itemType: "command_execution",
        turnId: "turn-2",
        threadId: "thread-2",
      });

      yield* coalescer.offer(partial({ detail: "a", itemId: "tool-1" }));
      yield* coalescer.offer(firstLatest);
      yield* coalescer.offer(secondItem);
      expect(published).toEqual([firstLatest]);

      yield* coalescer.offer(secondItemReset);
      expect(published).toEqual([firstLatest, secondItem]);

      yield* coalescer.offer(nextTurn);
      expect(published).toEqual([firstLatest, secondItem, secondItemReset]);

      yield* coalescer.offer(nextThread);
      expect(published).toEqual([firstLatest, secondItem, secondItemReset, nextTurn]);

      yield* coalescer.offer(nextProvider);
      expect(published).toEqual([firstLatest, secondItem, secondItemReset, nextTurn, nextThread]);

      yield* coalescer.offer(nextItemType);
      expect(published).toEqual([
        firstLatest,
        secondItem,
        secondItemReset,
        nextTurn,
        nextThread,
        nextProvider,
      ]);

      yield* coalescer.flush;
      expect(published).toEqual([
        firstLatest,
        secondItem,
        secondItemReset,
        nextTurn,
        nextThread,
        nextProvider,
        nextItemType,
      ]);
    }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect("passes non-tool and terminal-shaped item updates through without buffering", () =>
  Effect.gen(function* () {
    const { coalescer, published } = yield* makeHarness();
    const nonToolUpdate = partial({ detail: "reasoning", itemType: "reasoning" });
    const terminalUpdate = partial({
      detail: "done",
      itemType: "file_change",
      status: "completed",
    });

    yield* coalescer.offer(nonToolUpdate);
    yield* coalescer.offer(terminalUpdate);

    expect(published).toEqual([nonToolUpdate, terminalUpdate]);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect("close clears pending state and prevents delayed publication", () =>
  Effect.gen(function* () {
    const { coalescer, published } = yield* makeHarness();

    yield* coalescer.offer(partial({ detail: "pending" }));
    yield* coalescer.close;
    yield* TestClock.adjust("1 second");
    yield* Effect.yieldNow;
    yield* coalescer.offer(partial({ detail: "ignored" }));

    expect(published).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);
