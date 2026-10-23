import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Inbox,
  Mail,
  MailOpen,
  Paperclip,
  RefreshCw,
  Send,
} from "lucide-react";
import { listGmailAccounts } from "@/lib/gmail.functions";
import {
  getMailboxMessage,
  listMailbox,
  type MailboxFolder,
  type MailboxPage,
  type MailboxMessage,
} from "@/lib/mailbox.functions";
import { parseAddress } from "@/lib/mail-address";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { SegmentedControl } from "@/components/app/segmented-control";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { relativeTime } from "@/lib/user-agent";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mailbox")({
  head: () => ({ meta: [{ title: "Mailbox — Smart Email Sender" }] }),
  component: MailboxPage,
});

const PAGE_SIZE = 50;

const FOLDERS = [
  { value: "inbox", label: "Inbox", icon: Inbox },
  { value: "sent", label: "Sent", icon: Send },
] as const;

function MailboxPage() {
  const qc = useQueryClient();
  const accountsFn = useServerFn(listGmailAccounts);
  const listFn = useServerFn(listMailbox);
  const getFn = useServerFn(getMailboxMessage);

  const accounts = useQuery({ queryKey: ["gmail-accounts"], queryFn: () => accountsFn() });
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folder, setFolder] = useState<MailboxFolder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default to the user's default Gmail account (listGmailAccounts returns it first).
  useEffect(() => {
    if (!accountId && accounts.data?.length) setAccountId(accounts.data[0].id);
  }, [accountId, accounts.data]);

  const account = accounts.data?.find((a) => a.id === accountId) ?? null;

  const list = useInfiniteQuery({
    queryKey: ["mailbox", accountId, folder],
    enabled: !!accountId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      listFn({ data: { accountId, folder, pageToken: pageParam, max: PAGE_SIZE } }),
    getNextPageParam: (last) => last.nextPageToken,
  });
  const messages = useMemo(() => list.data?.pages.flatMap((p) => p.messages) ?? [], [list.data]);

  const detail = useQuery({
    queryKey: ["mailbox-message", accountId, selectedId],
    enabled: !!accountId && !!selectedId,
    queryFn: () => getFn({ data: { accountId, id: selectedId! } }),
  });

  // Opening a message marks it read in Gmail — reflect that in the cached list.
  useEffect(() => {
    if (!detail.data) return;
    qc.setQueryData<InfiniteData<MailboxPage>>(["mailbox", accountId, folder], (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              messages: p.messages.map((m) =>
                m.id === detail.data.id ? { ...m, unread: false } : m,
              ),
            })),
          }
        : old,
    );
  }, [detail.data, accountId, folder, qc]);

  // Below lg the reading pane replaces the list, so the device back button should return to the list.
  const singlePane = useMediaQuery("(max-width: 1023px)");
  useBackToClose(singlePane && !!selectedId, () => setSelectedId(null));

  const switchAccount = (id: string) => {
    setAccountId(id);
    setSelectedId(null);
  };
  const switchFolder = (f: MailboxFolder) => {
    setFolder(f);
    setSelectedId(null);
  };

  const noAccounts = accounts.isSuccess && accounts.data.length === 0;

  return (
    <Page size="wide">
      <PageHeader
        eyebrow="02 · Outreach"
        title="Mailbox"
        icon={Mail}
        description={`The latest ${PAGE_SIZE} messages in your Gmail inbox and sent folder, for any connected account.`}
        actions={
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => list.refetch()}
            disabled={!accountId || list.isFetching}
          >
            <RefreshCw className={list.isFetching ? "animate-spin" : undefined} aria-hidden />
            {list.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {noAccounts ? (
        <EmptyState
          icon={Mail}
          title="No Gmail account connected"
          description="Connect a Gmail account in Settings to see your inbox here."
          action={
            <Button asChild>
              <Link to="/settings">Open settings</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SegmentedControl
              value={folder}
              onValueChange={switchFolder}
              ariaLabel="Folder"
              options={[...FOLDERS]}
            />
            <div className="w-full min-w-0 space-y-1.5 sm:w-72">
              <Label htmlFor="mailbox-account" className="eyebrow">
                Account
              </Label>
              {accounts.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={accountId ?? undefined} onValueChange={switchAccount}>
                  <SelectTrigger id="mailbox-account" className="w-full">
                    <SelectValue placeholder="Choose account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.data?.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label ? `${a.label} · ${a.gmail_email}` : a.gmail_email}
                        {a.is_default ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 border-2 border-border bg-card shadow-[var(--shadow-brutal)] lg:grid-cols-[400px_minmax(0,1fr)]">
            {/* ── Message list ─────────────────────────────────────── */}
            <div
              className={cn(
                "min-w-0 lg:border-r-2 lg:border-border",
                selectedId && "hidden lg:block",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-muted px-4 py-2.5">
                <p className="truncate font-mono text-xs font-semibold uppercase tracking-[0.08em]">
                  {folder} · {account?.gmail_email ?? "…"}
                </p>
                {list.data && (
                  <p className="tabular shrink-0 text-xs text-muted-foreground">
                    {messages.length}
                  </p>
                )}
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                {list.isLoading || (!accountId && accounts.isLoading) ? (
                  <ListSkeleton />
                ) : list.isError ? (
                  <ErrorState
                    className="m-4"
                    title="Couldn't load messages"
                    error={list.error}
                    onRetry={() => list.refetch()}
                    retrying={list.isFetching}
                  />
                ) : messages.length ? (
                  <>
                    <ul className="divide-y divide-border/20">
                      {messages.map((m) => (
                        <li key={m.id}>
                          <MessageRow
                            m={m}
                            folder={folder}
                            selected={selectedId === m.id}
                            onSelect={() => setSelectedId(m.id)}
                          />
                        </li>
                      ))}
                    </ul>
                    {list.hasNextPage && (
                      <div className="border-t-2 border-border p-3">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => list.fetchNextPage()}
                          disabled={list.isFetchingNextPage}
                        >
                          {list.isFetchingNextPage ? "Loading…" : `Load ${PAGE_SIZE} more`}
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    framed={false}
                    icon={folder === "inbox" ? Inbox : Send}
                    title={folder === "inbox" ? "Inbox is empty" : "No sent mail"}
                    description="Nothing in this folder for the selected account."
                  />
                )}
              </div>
            </div>

            {/* ── Reading pane ─────────────────────────────────────── */}
            <div className={cn("min-w-0", !selectedId && "hidden lg:block")}>
              {!selectedId ? (
                <EmptyState
                  framed={false}
                  className="py-24"
                  icon={MailOpen}
                  title="Select a message"
                  description="Pick a message from the list to read it."
                />
              ) : detail.isError ? (
                <div className="space-y-4 p-4 sm:p-6">
                  <BackButton onClick={() => setSelectedId(null)} />
                  <ErrorState
                    title="Couldn't open this message"
                    error={detail.error}
                    onRetry={() => detail.refetch()}
                    retrying={detail.isFetching}
                  />
                </div>
              ) : detail.isLoading || !detail.data ? (
                <div className="space-y-4 p-4 sm:p-6" aria-busy="true" aria-label="Loading message">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-7 w-2/3" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : (
                <article className="flex min-w-0 flex-col">
                  <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-muted px-4 py-2 sm:px-6">
                    <BackButton onClick={() => setSelectedId(null)} />
                    <p className="hidden font-mono text-xs font-semibold uppercase tracking-[0.08em] lg:block">
                      Message
                    </p>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(account?.gmail_email ?? "")}#all/${detail.data.threadId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink aria-hidden /> Open in Gmail
                      </a>
                    </Button>
                  </div>
                  <div className="space-y-5 px-4 py-5 sm:px-6">
                    <h2 className="font-expanded break-words text-xl leading-tight sm:text-2xl">
                      {detail.data.subject || "(no subject)"}
                    </h2>
                    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-2 border-border bg-background p-3 font-mono text-xs">
                      <dt className="uppercase tracking-[0.08em] text-muted-foreground">From</dt>
                      <dd className="min-w-0 break-words font-semibold">{detail.data.from}</dd>
                      <dt className="uppercase tracking-[0.08em] text-muted-foreground">To</dt>
                      <dd className="min-w-0 break-words">{detail.data.to}</dd>
                      {detail.data.cc && (
                        <>
                          <dt className="uppercase tracking-[0.08em] text-muted-foreground">Cc</dt>
                          <dd className="min-w-0 break-words">{detail.data.cc}</dd>
                        </>
                      )}
                      {detail.data.date && (
                        <>
                          <dt className="uppercase tracking-[0.08em] text-muted-foreground">
                            Date
                          </dt>
                          <dd className="min-w-0">{new Date(detail.data.date).toLocaleString()}</dd>
                        </>
                      )}
                    </dl>
                    {detail.data.attachments.length > 0 && (
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Paperclip className="size-3.5" aria-hidden />
                        {detail.data.attachments.join(", ")}
                      </p>
                    )}
                    {detail.data.html ? (
                      <MailHtml html={detail.data.html} />
                    ) : (
                      <div className="max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {detail.data.text}
                      </div>
                    )}
                  </div>
                </article>
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function MessageRow({
  m,
  folder,
  selected,
  onSelect,
}: {
  m: MailboxMessage;
  folder: MailboxFolder;
  selected: boolean;
  onSelect: () => void;
}) {
  // Inbox rows lead with the sender, Sent rows with the recipient — same as Gmail.
  const who =
    folder === "sent" ? `To: ${parseAddress(m.to).display}` : parseAddress(m.from).display;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-offset-[-3px]",
        selected ? "bg-secondary text-secondary-foreground" : "hover:bg-accent",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2.5 shrink-0",
          m.unread ? "border-2 border-border bg-primary" : "border-2 border-transparent",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-sm", m.unread ? "font-extrabold" : "font-medium")}>
            {m.unread && <span className="sr-only">Unread: </span>}
            {who || "(unknown)"}
          </span>
          {m.date && (
            <span
              className={cn(
                "tabular shrink-0 text-xs",
                selected ? "opacity-75" : "text-muted-foreground",
              )}
            >
              {relativeTime(m.date)}
            </span>
          )}
        </span>
        <span className={cn("block truncate text-xs", m.unread && "font-semibold")}>
          {m.subject || "(no subject)"}
        </span>
        <span
          className={cn(
            "block truncate text-xs",
            selected ? "opacity-75" : "text-muted-foreground",
          )}
        >
          {m.snippet}
        </span>
      </span>
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className="lg:hidden" onClick={onClick}>
      <ArrowLeft aria-hidden /> Back
    </Button>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border/20" aria-busy="true" aria-label="Loading messages">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex gap-3 px-4 py-3">
          <Skeleton className="mt-1 size-2.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Renders an email's HTML in a sandboxed iframe: no scripts, links open in a new tab.
 * `allow-same-origin` (without `allow-scripts`) only lets us measure the content height.
 */
function MailHtml({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">` +
      `<style>body{margin:0;padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}</style>` +
      `</head><body>${html}</body></html>`,
    [html],
  );
  const measure = () => {
    const doc = ref.current?.contentDocument;
    if (doc?.body) setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 120), 20_000));
  };
  return (
    <iframe
      ref={ref}
      title="Email content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      onLoad={() => {
        measure();
        // Late-loading images change the height.
        window.setTimeout(measure, 800);
      }}
      style={{ height }}
      className="w-full border-2 border-border bg-white"
    />
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
