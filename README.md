# 가게부 2026
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>가계부 Pro 2026</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
    <style>
        body { font-family: 'Pretendard', sans-serif; -webkit-tap-highlight-color: transparent; letter-spacing: -0.02em; }
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
        .glass { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(12px); }
        /* 애니메이션 효과 */
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        /* 스크롤바 숨김 */
        ::-webkit-scrollbar { display: none; }
    </style>
</head>
<body class="bg-[#F8F9FB] text-slate-900">

    <div class="bg-indigo-600 pt-12 pb-16 px-6 rounded-b-[3rem] shadow-2xl shadow-indigo-100">
        <div class="max-w-md mx-auto">
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h2 class="text-indigo-100 text-sm font-medium opacity-90 mb-1">2026년 전체 잔액</h2>
                    <h1 id="total-balance" class="text-4xl font-bold text-white tabular-nums">0원</h1>
                </div>
                <div class="bg-indigo-500/30 p-3 rounded-2xl">
                    <span class="text-2xl">💳</span>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-3 mt-8">
                <div class="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                    <p class="text-indigo-100 text-xs mb-1">이번 달 수입</p>
                    <p id="total-income" class="text-white font-bold text-lg">+0원</p>
                </div>
                <div class="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                    <p class="text-indigo-100 text-xs mb-1">이번 달 지출</p>
                    <p id="total-expense" class="text-white font-bold text-lg">-0원</p>
                </div>
            </div>
        </div>
    </div>

    <main class="max-w-md mx-auto px-6 -mt-8">
        <div class="flex items-center justify-between mb-4 px-1">
            <h3 class="font-bold text-lg flex items-center gap-2">
                최신 내역 <span id="item-count" class="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">0</span>
            </h3>
            <button onclick="refreshData()" class="text-indigo-600 text-sm font-semibold">새로고침</button>
        </div>

        <div id="ledger-list" class="space-y-4 pb-32">
            <div class="animate-pulse flex space-x-4 bg-white p-6 rounded-3xl">
                <div class="rounded-full bg-slate-100 h-12 w-12"></div>
                <div class="flex-1 space-y-3 py-1">
                    <div class="h-2 bg-slate-100 rounded"></div>
                    <div class="h-2 bg-slate-100 rounded w-5/6"></div>
                </div>
            </div>
        </div>
    </main>

    <div class="fixed bottom-0 left-0 right-0 p-6 pointer-events-none flex justify-center z-40">
        <button onclick="openModal()" class="pointer-events-auto bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 active:scale-95 transition-transform">
            <span class="text-xl font-light">+</span>
            <span class="font-bold tracking-tight">내역 추가</span>
        </button>
    </div>

    <div id="modal" class="hidden fixed inset-0 z-50 overflow-hidden">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onclick="closeModal()"></div>
        <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] p-8 pb-12 animate-slide-up max-w-md mx-auto">
            <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8"></div>
            
            <div class="flex bg-slate-100 p-1 rounded-2xl mb-8">
                <button id="type-expense" onclick="setType('expense')" class="flex-1 py-3.5 rounded-xl font-bold text-sm bg-white text-indigo-600 shadow-sm transition-all">지출 (-)</button>
                <button id="type-income" onclick="setType('income')" class="flex-1 py-3.5 rounded-xl font-bold text-sm text-slate-500 transition-all">수입 (+)</button>
            </div>

            <div class="space-y-6">
                <div class="relative">
                    <label class="text-[11px] font-bold text-slate-400 absolute top-3 left-4 uppercase">Date</label>
                    <input type="date" id="in-date" class="w-full pt-8 pb-3 px-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-500 outline-none font-medium">
                </div>
                <div class="relative">
                    <label class="text-[11px] font-bold text-slate-400 absolute top-3 left-4 uppercase">Description</label>
                    <input type="text" id="in-desc" placeholder="내역을 입력하세요" class="w-full pt-8 pb-3 px-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-500 outline-none font-medium">
                </div>
                <div class="relative pb-4">
                    <label class="text-[11px] font-bold text-slate-400 absolute top-3 left-4 uppercase">Amount</label>
                    <input type="number" id="in-amount" placeholder="0" inputmode="numeric" class="w-full pt-8 pb-3 px-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-500 outline-none text-2xl font-bold text-indigo-600">
                </div>
                
                <button onclick="saveEntry()" class="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-bold text-lg active:bg-indigo-800 shadow-xl shadow-indigo-100 transition-all">
                    기록 저장하기
                </button>
            </div>
        </div>
    </div>

    <script>
        // Supabase 연결 설정
        const SB_URL = 'https://lahgmjaoskqyzegiqrms.supabase.co';
        const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhaGdtamFvc2txeXplZ2lxcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MjM5NTEsImV4cCI6MjA5MzA5OTk1MX0.EBP3BzqXAQKP_ubtCCC7vWkl4Gi4B3KNc8-SpEBsV5k';
        const sb = supabase.createClient(SB_URL, SB_KEY);

        let entryType = 'expense';

        window.onload = () => {
            document.getElementById('in-date').valueAsDate = new Date();
            refreshData();
        };

        // 데이터 동기화
        async function refreshData() {
            const { data, error } = await sb.from('ledger').select('*').order('date', { ascending: false }).order('id', { ascending: false });
            if (error) return alert('연결 오류: ' + error.message);
            renderUI(data);
        }

        // UI 렌더링 (잔액 계산 + 리스트)
        function renderUI(list) {
            const listContainer = document.getElementById('ledger-list');
            let total = 0, income = 0, expense = 0;
            listContainer.innerHTML = '';

            list.forEach(item => {
                total += item.amount;
                if(item.amount > 0) income += item.amount;
                else expense += Math.abs(item.amount);

                const isNeg = item.amount < 0;
                const emoji = isNeg ? '💸' : '💰';
                
                listContainer.innerHTML += `
                    <div class="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center group active:scale-95 transition-transform">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-slate-50">${emoji}</div>
                            <div>
                                <h4 class="font-bold text-slate-800 text-[15px]">${item.description}</h4>
                                <p class="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">${item.date.replace(/-/g, '.')}</p>
                            </div>
                        </div>
                        <div class="text-right flex flex-col items-end gap-1">
                            <span class="font-bold text-[16px] ${isNeg ? 'text-slate-900' : 'text-emerald-600'}">
                                ${isNeg ? '-' : '+'}${Math.abs(item.amount).toLocaleString()}원
                            </span>
                            <button onclick="deleteEntry(${item.id})" class="text-[10px] text-red-300 font-bold hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                        </div>
                    </div>
                `;
            });

            // 대시보드 업데이트
            document.getElementById('total-balance').innerText = total.toLocaleString() + '원';
            document.getElementById('total-income').innerText = '+' + income.toLocaleString() + '원';
            document.getElementById('total-expense').innerText = '-' + expense.toLocaleString() + '원';
            document.getElementById('item-count').innerText = list.length;

            if(list.length === 0) {
                listContainer.innerHTML = '<div class="py-20 text-center text-slate-300 font-medium text-sm">기록된 내역이 없습니다.</div>';
            }
        }

        // 모달 관리
        function openModal() { 
            document.getElementById('modal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
        function closeModal() { 
            document.getElementById('modal').classList.add('hidden');
            document.body.style.overflow = 'auto';
        }

        function setType(type) {
            entryType = type;
            const exBtn = document.getElementById('type-expense');
            const inBtn = document.getElementById('type-income');
            const amtInp = document.getElementById('in-amount');

            if(type === 'expense') {
                exBtn.className = "flex-1 py-3.5 rounded-xl font-bold text-sm bg-white text-indigo-600 shadow-sm";
                inBtn.className = "flex-1 py-3.5 rounded-xl font-bold text-sm text-slate-500";
                amtInp.classList.replace('text-emerald-600', 'text-indigo-600');
            } else {
                inBtn.className = "flex-1 py-3.5 rounded-xl font-bold text-sm bg-white text-emerald-600 shadow-sm";
                exBtn.className = "flex-1 py-3.5 rounded-xl font-bold text-sm text-slate-500";
                amtInp.classList.replace('text-indigo-600', 'text-emerald-600');
            }
        }

        // 저장 로직
        async function saveEntry() {
            const date = document.getElementById('in-date').value;
            const description = document.getElementById('in-desc').value.trim();
            let amount = parseInt(document.getElementById('in-amount').value);

            if(!description || isNaN(amount)) return alert('내용과 금액을 모두 입력해주세요!');
            
            amount = entryType === 'expense' ? -Math.abs(amount) : Math.abs(amount);

            const { error } = await sb.from('ledger').insert([{ date, description, amount }]);

            if (error) alert('저장 실패: ' + error.message);
            else {
                document.getElementById('in-desc').value = '';
                document.getElementById('in-amount').value = '';
                closeModal();
                refreshData();
            }
        }

        // 삭제 로직
        async function deleteEntry(id) {
            if(!confirm('정말 삭제할까요?')) return;
            const { error } = await sb.from('ledger').delete().eq('id', id);
            if (error) alert('삭제 실패');
            else refreshData();
        }
    </script>
</body>
</html>
