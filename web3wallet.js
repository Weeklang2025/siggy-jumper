 /**
 * web3wallet.js — Ritual Network Web3 Integration
 * Оплата нативным токеном CRAT (legacy tx, type 0)
 * Fixes: EIP-6963 wallet detection, retry logic, mandatory payment
 */

const RITUAL_CHAIN_ID     = 1979;
const RITUAL_CHAIN_ID_HEX = '0x' + RITUAL_CHAIN_ID.toString(16);

const RITUAL_NETWORK = {
    chainId: RITUAL_CHAIN_ID_HEX,
    chainName: 'Ritual Network',
    nativeCurrency: { name: 'CRAT', symbol: 'CRAT', decimals: 18 },
    rpcUrls: ['https://rpc.ritualfoundation.org'],
    blockExplorerUrls: ['https://explorer.ritualfoundation.org']
};

const RITUAL_RECEIVER = '0xF52812a57f33C72528a3D870271D1a0023FA7C5f';
const ENTRY_FEE_CRAT  = 0.1;
const ENTRY_FEE_WEI   = BigInt(Math.round(ENTRY_FEE_CRAT * 1e18));
const EXPLORER_URL    = 'https://explorer.ritualfoundation.org';

// ===== EIP-6963: Реестр кошельков через новый стандарт =====
const eip6963Providers = new Map(); // rdns -> { info, provider }

window.addEventListener('eip6963:announceProvider', (event) => {
    const { info, provider } = event.detail;
    eip6963Providers.set(info.rdns, { info, provider });
    console.log('[web3wallet] EIP-6963 wallet announced:', info.name);
});

// Запрашиваем анонс от всех кошельков
window.dispatchEvent(new Event('eip6963:requestProvider'));

// ===== СОСТОЯНИЕ =====
window.walletState = {
    connected: false,
    address: null,
    provider: null,
    signer: null,
    balance: 0n,
    paidForThisSession: false
};

// ===== DOM =====
const connectWalletBtn = document.getElementById('connectWalletBtn');
const walletInfo       = document.getElementById('walletInfo');
const walletAddressEl  = document.getElementById('walletAddress');
const ritualBalanceEl  = document.getElementById('ritualBalance');
const disconnectBtn    = document.getElementById('disconnectBtn');
const hudBalance       = document.getElementById('hudBalance');
const gameWalletHud    = document.getElementById('gameWalletHud');
const payToPlayModal   = document.getElementById('payToPlayModal');
const payModalBalance  = document.getElementById('payModalBalance');
const payStatus        = document.getElementById('payStatus');
const payError         = document.getElementById('payError');
const entryFeeDisplay  = document.getElementById('entryFeeDisplay');
const txToast          = document.getElementById('txToast');
const txLink           = document.getElementById('txLink');

// Убираем кнопку "Play without wallet" из DOM полностью
const paySkipBtnEl = document.getElementById('paySkipBtn');
if (paySkipBtnEl) paySkipBtnEl.style.display = 'none';

entryFeeDisplay.textContent = `${ENTRY_FEE_CRAT} CRAT`;

// ===== ОПРЕДЕЛЕНИЕ КОШЕЛЬКОВ =====
// Ждём немного, чтобы кошельки успели инжектироваться
async function waitForProvider(ms = 1000) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function detectWallets() {
    await waitForProvider(500);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    await waitForProvider(100);

    const emojis = { metamask: '🦊', rabby: '🐰', okx: '⭕', coinbase: '🔵', unknown: '👛' };
    // Map id -> wallet — гарантирует отсутствие дублей
    const seen = new Map();

    // 1. EIP-6963 кошельки (современный стандарт)
    for (const [rdns, { info, provider }] of eip6963Providers) {
        let id = rdns; // уникальный ключ по умолчанию
        if (rdns.includes('metamask'))                          id = 'metamask';
        else if (rdns.includes('rabby'))                        id = 'rabby';
        else if (rdns.includes('okx') || rdns.includes('okex')) id = 'okx'; // com.okex.wallet + com.okx.wallet
        else if (rdns.includes('coinbase'))                     id = 'coinbase';
        else if (rdns.includes('phantom'))                      id = 'phantom';
        else if (rdns.includes('leap'))                         id = 'leap';

        // Иконка: только data URI или http — иначе эмодзи (никогда не raw base64 текст)
        const rawIcon = info.icon || '';
        const icon = (rawIcon.startsWith('data:') || rawIcon.startsWith('http'))
            ? rawIcon
            : (emojis[id] || '👛');

        seen.set(id, { id, name: info.name, provider, icon });
    }

    // 1б. Дополнительная дедупликация по имени кошелька
    // (на случай если один провайдер объявил несколько rdns)
    const namesSeen = new Set();
    for (const [key, val] of seen) {
        const nameLower = val.name.toLowerCase();
        if (namesSeen.has(nameLower)) {
            seen.delete(key);
        } else {
            namesSeen.add(nameLower);
        }
    }

    // 2. Legacy — добавляем только если такого кошелька ещё нет (нет дублей)
    if (!seen.has('metamask') && window.ethereum?.isMetaMask && !window.ethereum?.isRabby) {
        seen.set('metamask', { id: 'metamask', name: 'MetaMask', provider: window.ethereum, icon: emojis.metamask });
    }
    if (!seen.has('rabby') && window.ethereum?.isRabby) {
        seen.set('rabby', { id: 'rabby', name: 'Rabby', provider: window.ethereum, icon: emojis.rabby });
    }
    if (!seen.has('okx') && window.okxwallet) {
        seen.set('okx', { id: 'okx', name: 'OKX Wallet', provider: window.okxwallet, icon: emojis.okx });
    }
    if (!seen.has('coinbase') && window.coinbaseWalletExtension) {
        seen.set('coinbase', { id: 'coinbase', name: 'Coinbase Wallet', provider: window.coinbaseWalletExtension, icon: emojis.coinbase });
    }
    if (seen.size === 0 && window.ethereum) {
        seen.set('unknown', { id: 'unknown', name: 'Browser Wallet', provider: window.ethereum, icon: emojis.unknown });
    }

    const wallets = [...seen.values()];
    console.log('[web3wallet] Detected wallets:', wallets.map(w => `${w.name} (${w.id})`));
    return wallets;
}

// ===== ХЕЛПЕРЫ =====
function makeEmojiSpan(emoji) {
    const span = document.createElement('span');
    span.style.cssText = 'font-size:24px;flex-shrink:0;line-height:1;';
    span.textContent = emoji;
    return span;
}

// ===== МОДАЛКА ВЫБОРА КОШЕЛЬКА =====
function showWalletPicker(wallets) {
    return new Promise((resolve) => {
        const old = document.getElementById('walletPickerModal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'walletPickerModal';
        modal.style.cssText = `
            position:fixed; top:0; left:0; width:100%; height:100%;
            background:rgba(0,0,0,0.88); z-index:99999;
            display:flex; justify-content:center; align-items:center;
        `;

        modal.innerHTML = `
            <div style="
                background:rgba(13,13,30,0.99); padding:40px 50px;
                border:4px solid #1fffb0; border-radius:16px;
                max-width:420px; width:90%; text-align:center;
                box-shadow:0 0 60px rgba(31,255,176,0.2);
                font-family:'SuperMario',sans-serif;
            ">
                <div style="font-size:36px; margin-bottom:8px;">🔗</div>
                <h2 style="color:#1fffb0; font-size:26px; margin:0 0 6px;">Connect Wallet</h2>
                <p style="color:#666; font-family:monospace; font-size:13px; margin:0 0 28px;">Choose your wallet</p>
                <div id="walletPickerList" style="display:flex; flex-direction:column; gap:12px;"></div>
                <button id="walletPickerCancel" style="
                    margin-top:20px; background:transparent; border:none;
                    color:#555; font-family:monospace; font-size:13px;
                    cursor:pointer; padding:8px;
                ">Cancel</button>
            </div>
        `;
        document.body.appendChild(modal);

        const list = modal.querySelector('#walletPickerList');
        wallets.forEach(w => {
            const btn = document.createElement('button');
            btn.style.cssText = `
                font-family:'SuperMario',sans-serif; font-size:18px;
                color:#0d0d0d; background:linear-gradient(135deg,#1fffb0,#59E09D);
                padding:14px 24px; border:none; border-radius:10px;
                cursor:pointer; display:flex; align-items:center; gap:12px;
                width:100%; transition:all 0.2s;
                box-shadow:0 3px 12px rgba(31,255,176,0.3);
            `;

            // Иконка через DOM — base64 никогда не рендерится как текст
            const isImageUrl = w.icon && (w.icon.startsWith('data:') || w.icon.startsWith('http'));
            if (isImageUrl) {
                const img = document.createElement('img');
                img.src = w.icon;
                img.style.cssText = 'width:28px;height:28px;border-radius:6px;flex-shrink:0;';
                img.onerror = () => { img.replaceWith(makeEmojiSpan('👛')); };
                btn.appendChild(img);
            } else {
                btn.appendChild(makeEmojiSpan(w.icon || '👛'));
            }

            const label = document.createElement('span');
            label.textContent = w.name;
            btn.appendChild(label);

            btn.onmouseover = () => btn.style.transform = 'scale(1.03)';
            btn.onmouseout  = () => btn.style.transform = 'scale(1)';
            btn.onclick = () => { modal.remove(); resolve(w); };
            list.appendChild(btn);
        });

        modal.querySelector('#walletPickerCancel').onclick = () => {
            modal.remove();
            resolve(null);
        };
    });
}

// ===== УТИЛИТЫ =====
function shortAddr(addr) {
    return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
}
function showToast(txHash) {
    txLink.href = `${EXPLORER_URL}/tx/${txHash}`;
    txToast.style.display = 'block';
    setTimeout(() => { txToast.style.display = 'none'; }, 7000);
}
function setPayStatus(msg) { payStatus.textContent = msg; }
function setPayError(msg)  { payError.textContent  = msg; }

async function updateBalance() {
    const ws = window.walletState;
    if (!ws.connected || !ws.provider) return;
    try {
        const raw = await ws.provider.getBalance(ws.address);
        ws.balance = raw;
        const formatted = Number(raw / (10n ** 15n)) / 1000;
        ritualBalanceEl.textContent = `⚡ ${formatted.toFixed(3)} CRAT`;
        hudBalance.textContent = formatted.toFixed(3);
        payModalBalance.textContent = `${formatted.toFixed(3)} CRAT`;
    } catch (e) {
        ritualBalanceEl.textContent = '⚡ — CRAT';
        payModalBalance.textContent = '— CRAT';
    }
}

function updateWalletUI() {
    const ws = window.walletState;
    if (ws.connected) {
        connectWalletBtn.style.display = 'none';
        walletInfo.style.display = 'flex';
        walletAddressEl.textContent = shortAddr(ws.address);
        gameWalletHud.style.display = 'block';
    } else {
        connectWalletBtn.style.display = 'block';
        walletInfo.style.display = 'none';
        gameWalletHud.style.display = 'none';
    }
}

// ===== ПОДКЛЮЧЕНИЕ КОШЕЛЬКА =====
// Храним ссылки на текущий rawProvider и обработчики, чтобы снимать их при disconnect
let _activeRawProvider = null;
let _onAccountsChanged = null;
let _onChainChanged = null;
let _isConnecting = false; // защита от двойного клика

function _removeProviderListeners() {
    if (_activeRawProvider && _onAccountsChanged) {
        try { _activeRawProvider.removeListener('accountsChanged', _onAccountsChanged); } catch(_) {}
        try { _activeRawProvider.removeListener('chainChanged', _onChainChanged); } catch(_) {}
    }
    _activeRawProvider = null;
    _onAccountsChanged = null;
    _onChainChanged = null;
}

function _resetConnectBtn() {
    connectWalletBtn.textContent = '🔗 Connect Wallet';
    connectWalletBtn.disabled = false;
    _isConnecting = false;
}

async function connectWallet() {
    if (_isConnecting) return; // предотвращаем двойной вызов
    _isConnecting = true;

    connectWalletBtn.textContent = 'Поиск...';
    connectWalletBtn.disabled = true;

    const wallets = await detectWallets();

    if (wallets.length === 0) {
        _resetConnectBtn();
        alert(
            'Wallet not found!\n\n' +
            'If you have MetaMask installed — refresh the page and try again.\n\n' +
            'If no wallet is installed:\n' +
            '• MetaMask: https://metamask.io\n' +
            '• OKX Wallet: https://okx.com/web3'
        );
        return;
    }

    let chosen;
    if (wallets.length === 1) {
        chosen = wallets[0];
    } else {
        chosen = await showWalletPicker(wallets);
    }

    if (!chosen) {
        _resetConnectBtn();
        return;
    }

    try {
        connectWalletBtn.textContent = 'Connection...';

        const rawProvider = chosen.provider;

        const accounts = await rawProvider.request({ method: 'eth_requestAccounts' });
        if (!accounts.length) throw new Error('No accounts');

        // Проверяем / переключаем сеть
        const chainId = await rawProvider.request({ method: 'eth_chainId' });
        if (chainId !== RITUAL_CHAIN_ID_HEX) {
            try {
                await rawProvider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: RITUAL_CHAIN_ID_HEX }]
                });
            } catch (switchErr) {
                if (switchErr.code === 4902) {
                    await rawProvider.request({
                        method: 'wallet_addEthereumChain',
                        params: [RITUAL_NETWORK]
                    });
                } else {
                    throw switchErr;
                }
            }
        }

        const provider = new ethers.BrowserProvider(rawProvider);
        const signer   = await provider.getSigner();
        const address  = await signer.getAddress();

        // Снимаем старые listeners перед добавлением новых
        _removeProviderListeners();

        window.walletState = {
            connected: true,
            address,
            provider,
            rawProvider,
            signer,
            balance: 0n,
            paidForThisSession: false
        };

        updateWalletUI();
        await updateBalance();

        // Вешаем listeners и сохраняем ссылки
        _activeRawProvider = rawProvider;
        _onAccountsChanged = (accs) => {
            if (!accs.length) disconnectWallet();
            // при смене аккаунта — не вызываем connectWallet автоматически,
            // пусть пользователь нажмёт кнопку сам (избегаем бесконечного цикла)
            else {
                disconnectWallet();
            }
        };
        _onChainChanged = () => window.location.reload();

        rawProvider.on('accountsChanged', _onAccountsChanged);
        rawProvider.on('chainChanged', _onChainChanged);

    } catch (e) {
        console.error('Wallet connect error:', e);
        // Не показываем alert при отмене пользователем (code 4001)
        if (e.code !== 4001 && e.code !== 'ACTION_REJECTED') {
            alert('Connection error: ' + (e.message || e));
        }
    } finally {
        _resetConnectBtn();
    }
}

function disconnectWallet() {
    _removeProviderListeners();
    window.walletState = {
        connected: false, address: null,
        provider: null, signer: null,
        balance: 0n, paidForThisSession: false
    };
    updateWalletUI();
}

// ===== PAY TO PLAY (обязательная оплата) =====
window.requestPayToPlay = function () {
    return new Promise((resolve) => {
        const ws = window.walletState;

        // Если кошелёк НЕ подключён — блокируем игру
        if (!ws.connected) {
            alert('To play, you need to connect a wallet and pay the entry fee.\n\nClick "Connect Wallet" in the top right corner.');
            resolve(false); // false = игра не начнётся
            return;
        }

        setPayStatus('');
        setPayError('');
        updateBalance().then(() => {
            payToPlayModal.style.display = 'flex';
        });

        function cleanup() {
            payToPlayModal.style.display = 'none';
            document.getElementById('payBtn').disabled = false;
            document.getElementById('payBtn').textContent = '⚡ Pay & Play';
            setPayStatus('');
            setPayError('');
        }

        const onPay = async () => {
            setPayError('');
            const ws = window.walletState;

            if (ws.balance < ENTRY_FEE_WEI) {
                setPayError(
                    `Insufficient CRAT. Required: ${ENTRY_FEE_CRAT}, ` +
                    `you have: ${Number(ws.balance / (10n ** 15n)) / 1000}`
                );
                return;
            }

            const currentPayBtn = document.getElementById('payBtn');
            currentPayBtn.disabled = true;
            currentPayBtn.textContent = 'Sending...';
            setPayStatus('Waiting for wallet confirmation...');

    try {
    // Используем rawProvider напрямую — минуем ethers который добавляет EIP-1559 поля
    const raw = ws.rawProvider || ws.provider.provider;

    const gasPriceHex = await raw.request({ method: 'eth_gasPrice', params: [] });
    const nonceHex    = await raw.request({ method: 'eth_getTransactionCount', params: [ws.address, 'latest'] });

    // Передаём только legacy поля (gasPrice без max*) — кошелёк отправит type 0
    const txHash = await raw.request({
        method: 'eth_sendTransaction',
        params: [{
            from:     ws.address,
            to:       RITUAL_RECEIVER,
            value:    '0x' + ENTRY_FEE_WEI.toString(16),
            gas:      '0x5208',
            gasPrice: gasPriceHex,
            nonce:    nonceHex
        }]
    });

    const tx = { hash: txHash, wait: () => ws.provider.waitForTransaction(txHash) };

                setPayStatus('Transaction sent, waiting for confirmation...');
                await tx.wait();
                showToast(tx.hash);
                ws.paidForThisSession = true;
                await updateBalance();
                cleanup();
                resolve(true); // игра начинается только после успешной оплаты
            } catch (e) {
                console.error('Payment error:', e);
                if (e.code === 4001 || e.code === 'ACTION_REJECTED') {
                    setPayError('Transaction was rejected. Payment is required to continue playing');
                } else {
                    setPayError('Error: ' + (e.reason || e.message || 'Unknown error'));
                }
                currentPayBtn.disabled = false;
                currentPayBtn.textContent = '⚡ Pay & Play';
                setPayStatus('');
                // resolve(false) НЕ вызываем — модалка остаётся открытой,
                // чтобы пользователь мог попробовать ещё раз
            }
        };

        // Заменяем кнопки, чтобы убрать старые обработчики
        const oldPayBtn  = document.getElementById('payBtn');
        const newPayBtn  = oldPayBtn.cloneNode(true);
        oldPayBtn.parentNode.replaceChild(newPayBtn, oldPayBtn);

        newPayBtn.addEventListener('click', onPay, { once: true });

        // Кнопка skip скрыта — закрыть модалку можно только оплатив
    });
};

// ===== EVENTS =====
connectWalletBtn.addEventListener('click', connectWallet);
disconnectBtn.addEventListener('click', disconnectWallet);

setInterval(() => {
    if (window.walletState.connected) updateBalance();
}, 30000);

console.log('[web3wallet] Loaded. EIP-6963 + legacy detection, mandatory payment, legacy tx (type 0).');

