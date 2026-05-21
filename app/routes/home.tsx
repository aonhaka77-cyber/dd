import { createHash } from "node:crypto";
import {
  Bell,
  ChartPie,
  Download,
  Eye,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
  Shield,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Form,
  data,
  redirect,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/home";
import { prisma } from "../db.server";

type LedgerRow = {
  id: number;
  date: string;
  description: string;
  amount: number;
  ownerName: string;
  accountId: string;
  sharedWith: string;
};

type NoticeComment = {
  id: number;
  author: string;
  body: string;
  time: string;
  likedBy?: string[];
};

const defaultCategories = [
  { id: "c1", name: "식비", icon: "🍚" },
  { id: "c2", name: "교통", icon: "🚕" },
  { id: "c3", name: "쇼핑", icon: "🛍️" },
  { id: "c4", name: "월급", icon: "💰" },
  { id: "c5", name: "카페", icon: "☕" },
  { id: "c6", name: "기타", icon: "✨" },
];

const sessionName = "moa_account";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "모아" },
    { name: "description", content: "React + Prisma SQLite 가계부" },
  ];
}

function parseList(value?: string | null): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function serializeList(value: string[]) {
  return JSON.stringify([...new Set(value.map((item) => item.trim()).filter(Boolean))]);
}

function parseComments(value?: string | null): NoticeComment[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function sessionCookie(accountId: string) {
  return `${sessionName}=${accountId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

function clearSessionCookie() {
  return `${sessionName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function passwordHash(username: string, password: string) {
  return createHash("sha256")
    .update(`moa:${username.toLowerCase()}:${password}`)
    .digest("hex");
}

function normalizeLoginId(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase();
}

async function currentAccount(request: Request) {
  const id = getCookie(request, sessionName);
  if (!id) return null;
  return prisma.account.findUnique({ where: { id } });
}

async function seedCategories(accountId: string) {
  await prisma.category.createMany({
    data: defaultCategories.map((cat, index) => ({
      id: `${accountId}-${cat.id}`,
      name: cat.name,
      icon: cat.icon,
      sortOrder: index,
      accountId,
    })),
  });
}

function won(value: number) {
  return `${Math.abs(value).toLocaleString("ko-KR")}원`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function asNumber(value: FormDataEntryValue | null) {
  return Number(String(value || "0").replace(/[^0-9-]/g, "")) || 0;
}

export async function loader({ request }: Route.LoaderArgs) {
  const account = await currentAccount(request);
  const notices = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  if (!account) {
    return data({
      account: null,
      items: [],
      categories: defaultCategories,
      budget: 1000000,
      viewers: [],
      logs: [],
      notices,
    });
  }

  const [allItems, categories, budgetSetting, logs] = await Promise.all([
    prisma.ledgerItem.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }] }),
    prisma.category.findMany({
      where: { accountId: account.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.setting.findUnique({
      where: { accountId_key: { accountId: account.id, key: "monthly_budget" } },
    }),
    prisma.systemLog.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  const items = allItems.filter(
    (item) =>
      item.accountId === account.id || parseList(item.sharedWith).includes(account.username),
  );
  const viewers = [
    ...new Set(
      allItems
        .filter((item) => item.accountId === account.id)
        .flatMap((item) => parseList(item.sharedWith)),
    ),
  ];

  return data({
    account: { id: account.id, username: account.username },
    items,
    categories: categories.length ? categories : defaultCategories,
    budget: Number(budgetSetting?.value || 1000000),
    viewers,
    logs,
    notices,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "logout") {
    return redirect("/", { headers: { "Set-Cookie": clearSessionCookie() } });
  }

  if (intent === "auth") {
    const mode = String(form.get("mode") || "login");
    const username = normalizeLoginId(form.get("username"));
    const password = String(form.get("password") || "");
    if (!username || password.length < 4) {
      return data({ ok: false, message: "아이디와 4자 이상 비밀번호를 입력해주세요." }, { status: 400 });
    }

    if (mode === "signup") {
      const existing = await prisma.account.findUnique({ where: { username } });
      if (existing) return data({ ok: false, message: "이미 사용 중인 아이디입니다." }, { status: 400 });
      const account = await prisma.account.create({
        data: { username, passwordHash: passwordHash(username, password) },
      });
      await seedCategories(account.id);
      await prisma.setting.create({
        data: { accountId: account.id, key: "monthly_budget", value: "1000000" },
      });
      return redirect("/", { headers: { "Set-Cookie": sessionCookie(account.id) } });
    }

    const account = await prisma.account.findUnique({ where: { username } });
    if (!account || account.passwordHash !== passwordHash(username, password)) {
      return data({ ok: false, message: "아이디 또는 비밀번호가 맞지 않습니다." }, { status: 400 });
    }
    return redirect("/", { headers: { "Set-Cookie": sessionCookie(account.id) } });
  }

  const account = await currentAccount(request);
  if (!account) return data({ ok: false, message: "로그인 후 사용할 수 있습니다." }, { status: 401 });

  if (intent === "saveItem") {
    const id = Number(form.get("id") || 0);
    const type = String(form.get("type") || "expense");
    const category = String(form.get("category") || "✨");
    const memo = String(form.get("description") || "").trim();
    const amount = Math.abs(asNumber(form.get("amount"))) * (type === "income" ? 1 : -1);
    const dateValue = String(form.get("date") || today());
    const payload = {
      date: dateValue,
      description: `${category} ${memo || (type === "income" ? "수입" : "지출")}`,
      amount,
      ownerName: account.username,
      sharedWith: String(form.get("sharedWith") || serializeList([])),
      accountId: account.id,
    };
    if (!amount) return data({ ok: false, message: "금액을 입력해주세요." }, { status: 400 });
    if (id) {
      await prisma.ledgerItem.update({
        where: { id, accountId: account.id },
        data: payload,
      });
    } else {
      await prisma.ledgerItem.create({ data: payload });
    }
    await prisma.systemLog.create({
      data: { accountId: account.id, type: "success", message: "내역이 저장되었습니다." },
    });
    return redirect("/");
  }

  if (intent === "deleteItem") {
    await prisma.ledgerItem.delete({
      where: { id: Number(form.get("id")), accountId: account.id },
    });
    await prisma.systemLog.create({
      data: { accountId: account.id, type: "info", message: "내역이 삭제되었습니다." },
    });
    return redirect("/");
  }

  if (intent === "saveBudget") {
    const budget = Math.max(asNumber(form.get("budget")), 0);
    await prisma.setting.upsert({
      where: { accountId_key: { accountId: account.id, key: "monthly_budget" } },
      create: { accountId: account.id, key: "monthly_budget", value: String(budget) },
      update: { value: String(budget) },
    });
    await prisma.systemLog.create({
      data: { accountId: account.id, type: "budget", message: `예산을 ${budget.toLocaleString()}원으로 변경했습니다.` },
    });
    return redirect("/");
  }

  if (intent === "addCategory") {
    const name = String(form.get("name") || "").trim();
    const icon = String(form.get("icon") || "✨").trim().slice(0, 4);
    if (name) {
      const count = await prisma.category.count({ where: { accountId: account.id } });
      await prisma.category.create({
        data: { accountId: account.id, name, icon, sortOrder: count + 1 },
      });
    }
    return redirect("/");
  }

  if (intent === "deleteCategory") {
    await prisma.category.delete({
      where: { id: String(form.get("id")), accountId: account.id },
    });
    return redirect("/");
  }

  if (intent === "saveViewers") {
    const viewers = String(form.get("viewers") || "")
      .split(",")
      .map((viewer) => viewer.trim().toLowerCase())
      .filter((viewer) => viewer && viewer !== account.username);
    await prisma.ledgerItem.updateMany({
      where: { accountId: account.id },
      data: { sharedWith: serializeList(viewers) },
    });
    await prisma.systemLog.create({
      data: { accountId: account.id, type: "info", message: "공유 권한을 저장했습니다." },
    });
    return redirect("/");
  }

  if (intent === "clearLogs") {
    await prisma.systemLog.deleteMany({ where: { accountId: account.id } });
    return redirect("/");
  }

  if (intent === "addNotice" && account.username === "akdhs323") {
    await prisma.notice.create({
      data: {
        title: String(form.get("title") || "").trim(),
        body: String(form.get("body") || "").trim(),
      },
    });
    return redirect("/");
  }

  if (intent === "deleteNotice" && account.username === "akdhs323") {
    await prisma.notice.delete({ where: { id: Number(form.get("id")) } });
    return redirect("/");
  }

  if (intent === "likeNotice") {
    const notice = await prisma.notice.findUnique({ where: { id: Number(form.get("id")) } });
    if (notice) {
      const likedBy = parseList(notice.likedBy);
      const next = likedBy.includes(account.username)
        ? likedBy.filter((name) => name !== account.username)
        : [...likedBy, account.username];
      await prisma.notice.update({
        where: { id: notice.id },
        data: { likedBy: serializeList(next), likes: next.length },
      });
    }
    return redirect("/");
  }

  if (intent === "addComment") {
    const notice = await prisma.notice.findUnique({ where: { id: Number(form.get("id")) } });
    const body = String(form.get("body") || "").trim();
    if (notice && body) {
      const comments = parseComments(notice.comments);
      comments.push({ id: Date.now(), author: account.username, body, time: new Date().toISOString() });
      await prisma.notice.update({
        where: { id: notice.id },
        data: { comments: JSON.stringify(comments) },
      });
    }
    return redirect("/");
  }

  return redirect("/");
}

export default function Home() {
  const { account, items, categories, budget, viewers, logs, notices } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const authFetcher = useFetcher<typeof action>();
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [activeModal, setActiveModal] = useState<"item" | "budget" | "category" | "security" | "system" | "stats" | null>(null);
  const [period, setPeriod] = useState<"all" | "month">("all");
  const [scope, setScope] = useState<"own" | "shared">("own");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.icon || "✨");

  const monthKey = new Date().toISOString().slice(0, 7);
  const ownItems = items.filter((item) => item.accountId === account?.id);
  const sharedItems = items.filter((item) => item.accountId !== account?.id);
  const visibleItems = items
    .filter((item) => (scope === "own" ? item.accountId === account?.id : item.accountId !== account?.id))
    .filter((item) => period === "all" || item.date.slice(0, 7) === monthKey)
    .filter((item) => item.description.toLowerCase().includes(query.toLowerCase()));

  const monthlyOwnItems = ownItems.filter((item) => item.date.slice(0, 7) === monthKey);
  const income = monthlyOwnItems.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const expense = monthlyOwnItems.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const total = ownItems.reduce((sum, item) => sum + item.amount, 0);
  const budgetPercent = budget > 0 ? Math.min(Math.round((expense / budget) * 100), 160) : 0;
  const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate() + 1;
  const safeDaily = Math.max(Math.floor((budget - expense) / Math.max(daysLeft, 1)), 0);

  const stats = useMemo(() => {
    const result = new Map<string, number>();
    monthlyOwnItems
      .filter((item) => item.amount < 0)
      .forEach((item) => {
        const icon = item.description.split(" ")[0] || "✨";
        result.set(icon, (result.get(icon) || 0) + Math.abs(item.amount));
      });
    return [...result.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthlyOwnItems]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2f7_0%,#f8fafc_42%,#fff_100%)] text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/90 px-5 py-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,.55)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div>
            <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-500">
              {new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date())}
            </p>
            <h1 className="text-xl font-black">모아</h1>
          </div>
          <div className="flex gap-2">
            <IconButton label="알림" onClick={() => setActiveModal("system")}><Bell /></IconButton>
            <IconButton label="카테고리" onClick={() => setActiveModal("category")}><Tag /></IconButton>
            <IconButton label="통계" onClick={() => setActiveModal("stats")}><ChartPie /></IconButton>
            {account && <IconButton label="공유 보안" onClick={() => setActiveModal("security")}><Shield /></IconButton>}
            {account ? (
              <Form method="post">
                <input type="hidden" name="intent" value="logout" />
                <button className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white" title={`${account.username} 로그아웃`}>
                  <LogOut className="h-5 w-5" />
                </button>
              </Form>
            ) : (
              <IconButton label="로그인" dark onClick={() => setActiveModal(null)}><User /></IconButton>
            )}
          </div>
        </div>
      </header>

      {!account ? (
        <main className="mx-auto max-w-xl px-5 py-8">
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-black">{authMode === "login" ? "로그인" : "회원가입"}</h2>
                <p className="text-sm font-bold text-slate-400">SQLite DB에 안전하게 저장합니다.</p>
              </div>
            </div>
            <authFetcher.Form method="post" className="grid gap-3">
              <input type="hidden" name="intent" value="auth" />
              <input type="hidden" name="mode" value={authMode} />
              <input name="username" autoComplete="username" placeholder="아이디" className="h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 font-bold outline-none focus:ring-2 focus:ring-indigo-200" />
              <input name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="비밀번호" className="h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 font-bold outline-none focus:ring-2 focus:ring-indigo-200" />
              {authFetcher.data && "message" in authFetcher.data && (
                <p className="text-sm font-bold text-rose-500">{authFetcher.data.message}</p>
              )}
              <button className="h-14 rounded-2xl bg-slate-900 font-black text-white">
                {authMode === "login" ? "로그인" : "회원가입"}
              </button>
              <button type="button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")} className="h-12 rounded-2xl bg-slate-100 font-bold text-slate-500">
                {authMode === "login" ? "회원가입하기" : "로그인하기"}
              </button>
            </authFetcher.Form>
          </section>
        </main>
      ) : (
        <>
          <section className="mx-auto max-w-xl p-5 sm:p-6">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_58%,#334155_100%)] p-6 text-white shadow-xl">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">현재 총 금액</p>
                  <h2 className="mt-1 break-words text-4xl font-black tabular-nums">{total.toLocaleString()}원</h2>
                </div>
                <button onClick={() => setActiveModal("budget")} className="rounded-xl border border-indigo-400/30 bg-indigo-500/20 px-3 py-1.5 text-right text-[10px] font-black text-indigo-200">
                  지출 {budgetPercent}% (목표 {budget.toLocaleString()})
                </button>
              </div>
              <div className="mb-6 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)]" style={{ width: `${Math.min(budgetPercent, 100)}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="이번 달 수입" value={`+${income.toLocaleString()}`} tone="text-emerald-400" />
                <Metric label="이번 달 지출" value={`-${expense.toLocaleString()}`} tone="text-rose-400" />
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-xl px-5 sm:px-6">
            <div className="mb-4 grid grid-cols-3 gap-2">
              <Insight label="남은 예산" value={`${(budget - expense).toLocaleString()}원`} />
              <Insight label="하루 가능" value={`${safeDaily.toLocaleString()}원`} />
              <Insight label="내역" value={`${ownItems.length}건`} />
            </div>
            <div className="mb-3 flex gap-2 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
              <Segment active={period === "all"} onClick={() => setPeriod("all")}>전체</Segment>
              <Segment active={period === "month"} onClick={() => setPeriod("month")}>이번 달</Segment>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
              <Segment active={scope === "own"} onClick={() => setScope("own")}>내 내역 {ownItems.length}</Segment>
              <Segment active={scope === "shared"} onClick={() => setScope("shared")}>공유 내역 {sharedItems.length}</Segment>
            </div>
            <div className="mb-5 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="내역 검색..." className="w-full rounded-2xl border border-slate-100 bg-white py-4 pl-11 pr-4 text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <button onClick={() => downloadCsv(ownItems)} className="grid w-14 place-items-center rounded-2xl border border-slate-100 bg-white text-slate-400 shadow-sm">
                <Download className="h-5 w-5" />
              </button>
            </div>
          </section>

          <main className="mx-auto max-w-xl px-5 pb-44 sm:px-6">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Ledger</p>
                <h2 className="text-lg font-black">{scope === "shared" ? "공유받은 내역" : "최근 내역"}</h2>
              </div>
              <span className="text-xs font-bold text-slate-400">{visibleItems.length}건</span>
            </div>
            <LedgerList items={visibleItems} accountId={account.id} />
          </main>

          <div className="pointer-events-none fixed bottom-8 left-0 right-0 z-40 flex justify-center px-4">
            <button onClick={() => setActiveModal("item")} className="pointer-events-auto flex h-16 w-full max-w-[240px] items-center justify-center gap-3 rounded-2xl bg-slate-900 px-4 font-bold text-white shadow-2xl">
              <Plus className="h-5 w-5" /> 내역 추가
            </button>
          </div>
        </>
      )}

      {activeModal === "item" && (
        <Modal title="내역 입력" onClose={() => setActiveModal(null)}>
          <Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value="saveItem" />
            <input type="hidden" name="sharedWith" value={serializeList(viewers)} />
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <Segment active={type === "expense"} onClick={() => setType("expense")}>지출</Segment>
              <Segment active={type === "income"} onClick={() => setType("income")}>수입</Segment>
            </div>
            <input type="hidden" name="type" value={type} />
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button key={cat.id} type="button" onClick={() => setSelectedCategory(cat.icon)} className={`min-w-20 rounded-2xl border px-3 py-3 text-center ${selectedCategory === cat.icon ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-100 bg-white"}`}>
                  <span className="block text-xl">{cat.icon}</span>
                  <span className="text-[11px] font-black">{cat.name}</span>
                </button>
              ))}
            </div>
            <input type="hidden" name="category" value={selectedCategory} />
            <input name="amount" inputMode="numeric" placeholder="금액" className="h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 text-xl font-black outline-none" />
            <input name="description" placeholder="메모" className="h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 font-bold outline-none" />
            <input name="date" type="date" defaultValue={today()} className="h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 font-bold outline-none" />
            <button className="h-14 rounded-2xl bg-slate-900 font-black text-white">저장</button>
          </Form>
        </Modal>
      )}

      {activeModal === "budget" && (
        <Modal title="예산 설정" onClose={() => setActiveModal(null)}>
          <Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value="saveBudget" />
            <input name="budget" defaultValue={budget.toLocaleString()} inputMode="numeric" className="h-16 rounded-2xl border border-slate-100 bg-slate-50 px-4 text-2xl font-black outline-none" />
            <button className="h-14 rounded-2xl bg-indigo-600 font-black text-white">저장</button>
          </Form>
        </Modal>
      )}

      {activeModal === "category" && (
        <Modal title="카테고리" onClose={() => setActiveModal(null)}>
          <Form method="post" className="mb-4 grid grid-cols-[72px_1fr_auto] gap-2">
            <input type="hidden" name="intent" value="addCategory" />
            <input name="icon" defaultValue="✨" className="h-14 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-center text-xl font-black" />
            <input name="name" placeholder="카테고리 이름" className="h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 font-bold" />
            <button className="h-14 rounded-2xl bg-slate-900 px-4 font-black text-white">추가</button>
          </Form>
          <div className="grid gap-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl shadow-sm">{cat.icon}</span>
                  <strong>{cat.name}</strong>
                </div>
                {!String(cat.id).startsWith("c") && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="deleteCategory" />
                    <input type="hidden" name="id" value={cat.id} />
                    <button className="grid h-10 w-10 place-items-center rounded-xl bg-white text-rose-400"><Trash2 className="h-4 w-4" /></button>
                  </Form>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {activeModal === "security" && (
        <Modal title="공유 권한" onClose={() => setActiveModal(null)}>
          <Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value="saveViewers" />
            <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
              쉼표로 아이디를 입력하면 내 모든 내역을 해당 계정에서 볼 수 있습니다.
            </p>
            <input name="viewers" defaultValue={viewers.join(", ")} placeholder="예: friend1, family2" className="h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 font-bold outline-none" />
            <button className="h-14 rounded-2xl bg-emerald-600 font-black text-white">저장</button>
          </Form>
        </Modal>
      )}

      {activeModal === "system" && (
        <Modal title="알림 센터" onClose={() => setActiveModal(null)}>
          {account?.username === "akdhs323" && (
            <Form method="post" className="mb-5 grid gap-2 rounded-2xl bg-indigo-50 p-4">
              <input type="hidden" name="intent" value="addNotice" />
              <input name="title" placeholder="공지 제목" className="h-12 rounded-xl border border-indigo-100 bg-white px-3 font-bold" />
              <textarea name="body" placeholder="공지 내용" className="min-h-24 rounded-xl border border-indigo-100 bg-white p-3 font-bold" />
              <button className="h-12 rounded-xl bg-indigo-600 font-black text-white">공지 등록</button>
            </Form>
          )}
          <div className="mb-6 grid gap-3">
            {notices.map((notice) => (
              <NoticeCard key={notice.id} notice={notice} username={account?.username} canDelete={account?.username === "akdhs323"} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-black">시스템 로그</h3>
            <Form method="post">
              <input type="hidden" name="intent" value="clearLogs" />
              <button className="text-xs font-black text-slate-400">비우기</button>
            </Form>
          </div>
          <div className="mt-3 grid gap-2">
            {logs.length ? logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-sm font-bold text-slate-700">{log.message}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-400">{new Date(log.createdAt).toLocaleString("ko-KR")}</p>
              </div>
            )) : <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-400">아직 로그가 없습니다.</p>}
          </div>
        </Modal>
      )}

      {activeModal === "stats" && (
        <Modal title="이번 달 통계" onClose={() => setActiveModal(null)}>
          <div className="grid grid-cols-3 gap-2">
            <Insight label="총 지출" value={expense.toLocaleString()} />
            <Insight label="하루 평균" value={Math.round(expense / Math.max(new Date().getDate(), 1)).toLocaleString()} />
            <Insight label="최다 지출" value={stats[0]?.[0] || "-"} />
          </div>
          <div className="mt-5 grid gap-3">
            {stats.length ? stats.map(([icon, amount], index) => (
              <div key={icon} className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <strong>#{index + 1} {icon}</strong>
                  <span className="font-black text-indigo-600">{amount.toLocaleString()}원</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${expense ? Math.round((amount / expense) * 100) : 0}%` }} />
                </div>
              </div>
            )) : <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-400">이번 달 지출이 없습니다.</p>}
          </div>
        </Modal>
      )}

      {navigation.state !== "idle" && (
        <div className="fixed inset-x-0 bottom-0 z-[100] h-1 bg-indigo-500" />
      )}
    </div>
  );
}

function IconButton({ children, label, dark = false, onClick }: { children: React.ReactNode; label: string; dark?: boolean; onClick?: () => void }) {
  return (
    <button type="button" title={label} onClick={onClick} className={`grid h-10 w-10 place-items-center rounded-xl ${dark ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500 shadow-sm"}`}>
      <span className="[&>svg]:h-5 [&>svg]:w-5">{children}</span>
    </button>
  );
}

function Segment({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl py-2.5 text-xs font-black transition ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-400"}`}>
      {children}
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/10 p-4">
      <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className={`break-words text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <p className="mb-1 text-[10px] font-black text-slate-400">{label}</p>
      <p className="truncate text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function LedgerList({ items, accountId }: { items: LedgerRow[]; accountId?: string }) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <p className="font-black text-slate-700">아직 내역이 없습니다</p>
        <p className="mt-1 text-sm font-bold text-slate-400">아래 버튼으로 첫 내역을 추가하세요.</p>
      </div>
    );
  }

  let lastDate = "";
  return (
    <div>
      {items.map((item) => {
        const dateLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(new Date(item.date));
        const showDate = dateLabel !== lastDate;
        lastDate = dateLabel;
        const icon = item.description.split(" ")[0] || "✨";
        const memo = item.description.split(" ").slice(1).join(" ") || "내역";
        const isOwner = item.accountId === accountId;
        return (
          <div key={item.id}>
            {showDate && <p className="mb-3 mt-6 flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-slate-400 after:h-px after:flex-1 after:bg-slate-200">{dateLabel}</p>}
            <article className="mb-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50 text-xl shadow-inner">{icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black text-slate-800">{memo}</p>
                  <p className="text-xs font-bold text-slate-400">{isOwner ? "내 내역" : `${item.ownerName} 공유`}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className={`rounded-xl px-3 py-2 text-right text-sm font-black tabular-nums ${item.amount < 0 ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600"}`}>
                    {item.amount < 0 ? "-" : "+"}{won(item.amount)}
                  </p>
                  {isOwner ? (
                    <Form method="post" onSubmit={(event) => !confirm("이 내역을 삭제할까요?") && event.preventDefault()}>
                      <input type="hidden" name="intent" value="deleteItem" />
                      <input type="hidden" name="id" value={item.id} />
                      <button className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-rose-300"><Trash2 className="h-4 w-4" /></button>
                    </Form>
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-slate-300"><Eye className="h-4 w-4" /></span>
                  )}
                </div>
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}

function NoticeCard({ notice, username, canDelete }: { notice: any; username?: string; canDelete: boolean }) {
  const comments = parseComments(notice.comments);
  const likedBy = parseList(notice.likedBy);
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-black">{notice.title}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-500">{notice.body}</p>
          <p className="mt-2 text-[10px] font-bold text-slate-400">{new Date(notice.createdAt).toLocaleString("ko-KR")}</p>
        </div>
        {canDelete && (
          <Form method="post">
            <input type="hidden" name="intent" value="deleteNotice" />
            <input type="hidden" name="id" value={notice.id} />
            <button className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-rose-400"><Trash2 className="h-4 w-4" /></button>
          </Form>
        )}
      </div>
      {username && (
        <Form method="post" className="mb-3">
          <input type="hidden" name="intent" value="likeNotice" />
          <input type="hidden" name="id" value={notice.id} />
          <button className={`w-full rounded-xl py-2 text-xs font-black ${likedBy.includes(username) ? "bg-rose-500 text-white" : "bg-rose-50 text-rose-500"}`}>
            좋아요 {likedBy.length}
          </button>
        </Form>
      )}
      <div className="grid gap-2">
        {comments.slice(-3).map((comment) => (
          <div key={comment.id} className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-black text-indigo-500">{comment.author}</p>
            <p className="text-sm font-bold text-slate-600">{comment.body}</p>
          </div>
        ))}
      </div>
      {username && (
        <Form method="post" className="mt-3 flex gap-2">
          <input type="hidden" name="intent" value="addComment" />
          <input type="hidden" name="id" value={notice.id} />
          <input name="body" placeholder="댓글 입력" className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold" />
          <button className="rounded-xl bg-slate-900 px-4 text-sm font-black text-white">등록</button>
        </Form>
      )}
    </article>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function downloadCsv(items: LedgerRow[]) {
  const lines = [
    ["날짜", "설명", "금액", "소유자"].join(","),
    ...items.map((item) =>
      [item.date, `"${item.description.replaceAll("\"", "\"\"")}"`, item.amount, item.ownerName].join(","),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `moa-ledger-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
