import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { quotes } from './quotes.js';

// --- DOM 元素 ---
const textContainer = document.getElementById('text-container');
const sourceElement = document.getElementById('quote-source');
const restartHint = document.getElementById('restart-hint');
const reloadBtn = document.getElementById('reload-btn');
const wpmDisplay = document.getElementById('wpm-display');
const accDisplay = document.getElementById('acc-display');
const bestDisplay = document.getElementById('best-display');
const bestContainer = document.getElementById('best-container');
const focusOverlay = document.getElementById('focus-overlay');

// Multiplayer DOMs
const vsBtn = document.getElementById('vs-btn');
const vsModal = document.getElementById('vs-modal');
const closeVsModal = document.getElementById('close-vs-modal');
const vsMenu = document.getElementById('vs-menu');
const vsRoom = document.getElementById('vs-room');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const botMatchBtn = document.getElementById('bot-match-btn');
const singlePlayerBtn = document.getElementById('single-player-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const readyBtn = document.getElementById('ready-btn');
const joinRoomInput = document.getElementById('join-room-input');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomStatus = document.getElementById('room-status');
const startMatchBtn = document.getElementById('start-match-btn');
const vsError = document.getElementById('vs-error');
const tlContainer = document.getElementById('traffic-light-container');
const tlCountdown = document.getElementById('traffic-countdown');
const lRed = document.getElementById('light-red');
const lYellow = document.getElementById('light-yellow');
const lGreen = document.getElementById('light-green');
const mpProgressContainer = document.getElementById('mp-progress-container');
const myProgress = document.getElementById('my-progress');
const oppProgress = document.getElementById('opp-progress');
const myMpWpm = document.getElementById('my-mp-wpm');
const oppMpWpm = document.getElementById('opp-mp-wpm');
const matchResult = document.getElementById('match-result');

// --- 狀態變數 ---
let currentQuote = "";
let charElements = [];
let currentIndex = 0;
let correctCount = 0;
let mistakes = 0;
let startTime = null;
let timerInterval = null;
let isFinished = false;
let isTypingLocked = false;
let bestWpm = localStorage.getItem('sublimeTypeBestWpm') || 0;
let currentWpmStat = 0;

// Firebase / MP 狀態
let db, auth, currentUser;
let currentRoomId = null;
let opponentId = null;
let isMultiplayer = false;
let isBotMode = false;
let isHost = false;
let firebaseReady = false;
let unsubscribeRoom = null;
let useLocalStorageMode = false;
window.localUid = 'local-' + Math.random().toString(36).substring(2, 8);

// Bot 狀態
window.botData = { progress: 0, wpm: 0, finished: false, targetWpm: 0 };
window.botQuoteIndex = 0;

bestDisplay.innerText = bestWpm;

// --- Firebase 初始化 ---
const initFirebase = async () => {
    try {
        let firebaseConfig = null;

        if (typeof __firebase_config !== 'undefined' && __firebase_config) {
            firebaseConfig = typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config;
        } else {
            // 若您自行上架，請將您的 Firebase Config 貼在這裡：
            firebaseConfig = {
                apiKey: "AIzaSyCvDbxRpGf5SNTVFyxEd2O_e13bKZAIXJw",
                authDomain: "typerace-d0bf0.firebaseapp.com",
                projectId: "typerace-d0bf0",
                storageBucket: "typerace-d0bf0.firebasestorage.app",
                messagingSenderId: "542646665759",
                appId: "1:542646665759:web:337b17a35f1bfc1c3acb2a",
                measurementId: "G-Q3CY5VZP93"
            };
        }

        if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
            return; // 靜默返回，進入 Bot 模式
        }

        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                firebaseReady = true;
            }
        });
    } catch (e) {
        console.log("Firebase skip, switching to Bot Mode.", e);
    }
};
initFirebase();

const getRoomRef = (roomId) => {
    return doc(db, 'rooms', roomId);
};

// --- 音效引擎 (Thock) ---
let audioCtx;
function playSound(type) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.04);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'error') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.15);
    }
}

// --- 核心邏輯 ---
function initGame(forceQuoteIndex = null) {
    clearInterval(timerInterval);
    startTime = null;
    currentIndex = 0;
    correctCount = 0;
    mistakes = 0;
    isFinished = false;
    wpmDisplay.innerText = "0";
    accDisplay.innerText = "100%";
    bestDisplay.classList.remove('new-best');
    sourceElement.style.opacity = '0';
    
    if (isMultiplayer) {
        restartHint.classList.add('hidden');
        if (reloadBtn) reloadBtn.classList.add('hidden');
    } else {
        restartHint.classList.remove('hidden');
        restartHint.style.opacity = '0';
        if (reloadBtn) reloadBtn.classList.remove('hidden');
    }

    // Reset car position for single player
    myProgress.style.left = '0%';
    myMpWpm.innerText = '0';

    let qIndex = forceQuoteIndex !== null ? forceQuoteIndex : Math.floor(Math.random() * quotes.length);
    const quoteObj = quotes[qIndex];
    currentQuote = quoteObj.text
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    sourceElement.innerText = `— ${quoteObj.source}`;

    textContainer.innerHTML = '';
    charElements = [];

    for (let i = 0; i < currentQuote.length; i++) {
        const span = document.createElement('span');
        span.innerText = currentQuote[i];
        span.classList.add('char');
        if (i === 0) span.classList.add('current');
        textContainer.appendChild(span);
        charElements.push(span);
    }

    if (isMultiplayer) {
        myProgress.style.left = "0%";
        oppProgress.style.left = "0%";
        myMpWpm.innerText = "0";
        oppMpWpm.innerText = "0";
        matchResult.classList.add('hidden');
        matchResult.innerText = "";
        matchResult.removeAttribute('data-finalized');
        isTypingLocked = false;
    }
}

function checkMatchEnd(playersData = null) {
    let myFinished = isFinished;
    let oppFinished = false;

    if (isBotMode) {
        oppFinished = window.botData.finished;
    } else if (playersData && opponentId && playersData[opponentId]) {
        oppFinished = playersData[opponentId].finished;
    }

    if (myFinished || oppFinished) {
        matchResult.classList.remove('hidden');

        if (myFinished && oppFinished) {
            // 平手或不覆蓋原本的狀態
        } else if (myFinished) {
            if (!matchResult.dataset.finalized) {
                matchResult.innerText = "YOU WIN! 🎉";
                matchResult.className = "text-center font-bold text-2xl mt-2 text-[var(--text-correct)] animate-pulse";
                matchResult.dataset.finalized = "true";
            }
        } else if (oppFinished) {
            if (!matchResult.dataset.finalized) {
                matchResult.innerText = "YOU LOSE! 💀 (Keep typing...)";
                matchResult.className = "text-center font-bold text-2xl mt-2 text-[var(--text-error)]";
                matchResult.dataset.finalized = "true";
            }
            // 不再鎖定鍵盤與停止計時，讓輸家可以打完
        }
    }
}

function calculateStats() {
    if (!startTime) return 0;
    const timeElapsedMin = (new Date() - startTime) / 60000;
    const safeTime = Math.max(timeElapsedMin, 0.01);
    currentWpmStat = Math.round((correctCount / 5) / safeTime);

    const totalTyped = correctCount + mistakes;
    const accuracy = totalTyped === 0 ? 100 : Math.round((correctCount / totalTyped) * 100);

    let displayWpm = isNaN(currentWpmStat) || currentWpmStat < 0 ? 0 : currentWpmStat;
    wpmDisplay.innerText = displayWpm;
    accDisplay.innerText = `${accuracy}%`;

    if (isMultiplayer) {
        myMpWpm.innerText = displayWpm;

        // Bot 模式：更新電腦對手進度
        if (isBotMode && !window.botData.finished) {
            const botTargetChars = Math.floor(window.botData.targetWpm * 5 * timeElapsedMin);
            window.botData.progress = Math.min(botTargetChars, currentQuote.length);
            window.botData.wpm = window.botData.targetWpm;

            if (window.botData.progress >= currentQuote.length) {
                window.botData.finished = true;
            }

            const progressPercent = (window.botData.progress / currentQuote.length) * 100;
            oppProgress.style.left = `calc(${progressPercent}% - ${progressPercent * 0.8}px)`;
            oppMpWpm.innerText = Math.round(window.botData.wpm);

            checkMatchEnd();
        }
    }

    return currentWpmStat;
}

function finishGame() {
    isFinished = true;
    clearInterval(timerInterval);
    const finalWpm = calculateStats();

    sourceElement.style.opacity = '1';

    if (!isMultiplayer) {
        restartHint.style.opacity = '1';
        // Ensure car is at 100% on finish
        myProgress.style.left = 'calc(100% - 80px)';
        if (finalWpm > bestWpm) {
            bestWpm = finalWpm;
            localStorage.setItem('sublimeTypeBestWpm', bestWpm);
            bestDisplay.innerText = bestWpm;
            bestDisplay.classList.add('new-best');
        }
    } else {
        if (!isBotMode) syncProgressToFirebase(true);
        checkMatchEnd();
    }
}

function syncProgressToFirebase(finished = false) {
    if (isBotMode || !currentRoomId) return;

    const role = isHost ? 'host' : 'guest';
    
    // LocalStorage 永遠即時同步
    const raw = localStorage.getItem(`room_${currentRoomId}`);
    if (raw) {
        const data = JSON.parse(raw);
        if (!data.players) data.players = {};
        if (!data.players[role]) data.players[role] = {};
        data.players[role].progress = correctCount;
        data.players[role].wpm = currentWpmStat || 0;
        data.players[role].finished = finished;
        localStorage.setItem(`room_${currentRoomId}`, JSON.stringify(data));
    }

    // Firebase 降低同步頻率 (每 2 字元同步一次) 以節省用量
    if (currentUser && firebaseReady) {
        if (finished || correctCount % 2 === 0) {
            updateDoc(getRoomRef(currentRoomId), {
                [`players.${role}.progress`]: correctCount,
                [`players.${role}.wpm`]: currentWpmStat || 0,
                [`players.${role}.finished`]: finished
            }).catch(() => {});
        }
    }
}

// --- 多人模式/Bot模式 功能 ---
function openVsModal() {
    vsModal.classList.remove('hidden');
    joinRoomInput.value = '';
    if (currentRoomId) {
        vsMenu.classList.add('hidden');
        vsRoom.classList.remove('hidden');
    } else {
        vsMenu.classList.remove('hidden');
        vsRoom.classList.add('hidden');
    }

    if (!firebaseReady) {
        vsError.innerText = "未設定資料庫連線\n已為您切換為【單機 Bot 對戰模式】";
        vsError.className = "text-[var(--text-untyped)] text-sm text-center h-8 mt-2 whitespace-pre-line";
    } else {
        vsError.innerText = "";
        vsError.className = "text-[var(--text-error)] text-sm text-center h-8 mt-2 whitespace-pre-line";
    }
}

function closeVsModalFn() {
    vsModal.classList.add('hidden');
}

function switchToSinglePlayer() {
    joinRoomInput.value = '';
    isMultiplayer = false;
    isBotMode = false;
    currentRoomId = null;
    isHost = false;
    if (unsubscribeRoom) {
        unsubscribeRoom();
        unsubscribeRoom = null;
    }
    vsModal.classList.add('hidden');
    vsMenu.classList.remove('hidden');
    vsRoom.classList.add('hidden');
    
    // 恢復單人模式 UI
    document.getElementById('opp-track').classList.add('hidden');
    document.getElementById('opp-track').classList.remove('flex');
    document.getElementById('my-role-label').innerText = "YOU";

    updateTrackColors();
    initGame();
}

function startBotMatch() {
    isBotMode = true;
    isHost = true;
    currentRoomId = "BOT";
    window.botQuoteIndex = Math.floor(Math.random() * quotes.length);

    window.botData = {
        progress: 0,
        wpm: 0,
        finished: false,
        targetWpm: Math.floor(Math.random() * 30) + 40
    };

    // 直接開始倒數，跳過等待畫面
    startCountdownSequence(window.botQuoteIndex);
}

function updateTrackColors() {
    const myLabel = document.getElementById('my-role-label');
    const myProg = document.getElementById('my-progress');
    const oppLabel = document.getElementById('opp-role-label');
    const oppProg = document.getElementById('opp-progress');

    // Single player or Host => I am RED, Opp is GREEN
    // Guest => I am GREEN, Opp is RED
    const iAmRed = !isMultiplayer || isHost;

    if (iAmRed) {
        myLabel.className = "text-xs text-[var(--text-error)] w-16 font-bold tracking-wider text-right";
        myProg.className = "absolute top-0 transition-all duration-300 text-[var(--text-error)] transform translate-y-2";
        oppLabel.className = "text-xs text-[var(--text-correct)] w-16 font-bold tracking-wider text-right";
        oppProg.className = "absolute top-0 transition-all duration-300 text-[var(--text-correct)] transform translate-y-2";
    } else {
        myLabel.className = "text-xs text-[var(--text-correct)] w-16 font-bold tracking-wider text-right";
        myProg.className = "absolute top-0 transition-all duration-300 text-[var(--text-correct)] transform translate-y-2";
        oppLabel.className = "text-xs text-[var(--text-error)] w-16 font-bold tracking-wider text-right";
        oppProg.className = "absolute top-0 transition-all duration-300 text-[var(--text-error)] transform translate-y-2";
    }
}

async function createRoom() {
    isHost = true;
    isBotMode = false;
    currentRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const quoteIndex = Math.floor(Math.random() * quotes.length);

    try {
        const uid = currentUser ? currentUser.uid : window.localUid;
        const roomData = {
            host: uid,
            guest: null,
            status: 'waiting',
            quoteIndex: quoteIndex,
            players: {
                host: { progress: 0, wpm: 0, finished: false, ready: false }
            }
        };

        // ALWAYS write to LocalStorage
        localStorage.setItem(`room_${currentRoomId}`, JSON.stringify(roomData));

        // Try writing to Firebase
        if (currentUser && firebaseReady) {
            setDoc(getRoomRef(currentRoomId), roomData).catch(() => {});
        }

        vsMenu.classList.add('hidden');
        vsRoom.classList.remove('hidden');
        roomCodeDisplay.innerText = currentRoomId;
        document.getElementById('p2-status').innerText = "Waiting for Player 2...";
        document.getElementById('p2-status').classList.add('text-gray-500', 'animate-pulse');
        document.getElementById('p2-status').classList.remove('text-[var(--text-highlight)]');
        startMatchBtn.classList.add('hidden');
        document.getElementById('guest-waiting-msg').classList.add('hidden');

        listenToRoom();
    } catch (error) {
        console.error("Create room error:", error);
    }
}

async function setReady() {
    if (isHost || !currentRoomId) return;

    const role = 'guest';
    const raw = localStorage.getItem(`room_${currentRoomId}`);
    if (raw) {
        const data = JSON.parse(raw);
        if (data.players[role]) {
            data.players[role].ready = true;
            localStorage.setItem(`room_${currentRoomId}`, JSON.stringify(data));
        }
    }
    if (currentUser && firebaseReady) {
        updateDoc(getRoomRef(currentRoomId), {
            [`players.${role}.ready`]: true
        }).catch(()=>{});
    }
    document.getElementById('ready-btn').classList.add('hidden');
    document.getElementById('guest-waiting-msg').classList.remove('hidden');
    document.getElementById('guest-waiting-msg').innerText = "You are Ready! Waiting for Player 1 to start...";
}

async function joinRoom() {
    const code = joinRoomInput.value.trim().toUpperCase();
    if (code.length !== 4) {
        vsError.innerText = "Code must be 4 characters.";
        return;
    }

    try {
        isHost = false;
        isBotMode = false;
        
        let roomData = null;
        const localRaw = localStorage.getItem(`room_${code}`);
        if (localRaw) {
            roomData = JSON.parse(localRaw);
        }

        // If not in local, try Firebase
        if (!roomData && currentUser && firebaseReady) {
            try {
                const roomSnap = await getDoc(getRoomRef(code));
                if (roomSnap.exists()) roomData = roomSnap.data();
            } catch (e) {}
        }

        if (!roomData) {
            vsError.innerText = "Room not found.";
            return;
        }

        if (roomData.status !== 'waiting') {
            vsError.innerText = "Room is already in progress or finished.";
            return;
        }

        roomData.players.guest = { progress: 0, wpm: 0, finished: false, ready: false };

        // ALWAYS update LocalStorage
        localStorage.setItem(`room_${code}`, JSON.stringify(roomData));

        // Try update Firebase
        if (currentUser && firebaseReady) {
            updateDoc(getRoomRef(code), {
                [`players.guest`]: { progress: 0, wpm: 0, finished: false, ready: false }
            }).catch(() => {});
        }

        currentRoomId = code;
        vsMenu.classList.add('hidden');
        vsRoom.classList.remove('hidden');
        roomCodeDisplay.innerText = currentRoomId;
        document.getElementById('p2-status').innerText = "Player 2 (You)";
        document.getElementById('p2-status').classList.remove('text-gray-500', 'animate-pulse');
        document.getElementById('p2-status').classList.add('text-[var(--text-highlight)]');
        startMatchBtn.classList.add('hidden');
        readyBtn.classList.remove('hidden');
        document.getElementById('guest-waiting-msg').classList.add('hidden');

        listenToRoom();
    } catch (error) {
        console.error("Join room error:", error);
        vsError.innerText = "Error: " + error.message;
    }
}

function handleRoomData(data) {
    const oppRole = isHost ? 'guest' : 'host';

    if (data.status === 'waiting') {
        const isGuestReady = data.players && data.players.guest ? data.players.guest.ready : false;

        if (isHost) {
            document.getElementById('p2-status').innerText = isGuestReady ? "Player 2 Ready!" : "Player 2 Joined! (Waiting...)";
            document.getElementById('p2-status').classList.remove('text-gray-500', 'animate-pulse');
            document.getElementById('p2-status').classList.add('text-[var(--text-highlight)]');
            startMatchBtn.classList.remove('hidden');

            if (isGuestReady) {
                startMatchBtn.disabled = false;
                startMatchBtn.classList.remove('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
                startMatchBtn.classList.add('bg-[var(--text-highlight)]', 'text-black');
                startMatchBtn.innerText = "Start Match";
            } else {
                startMatchBtn.disabled = true;
                startMatchBtn.classList.add('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
                startMatchBtn.classList.remove('bg-[var(--text-highlight)]', 'text-black');
                startMatchBtn.innerText = "Start Match (Waiting for P2...)";
            }
        }
    }

    if (data.status === 'playing' && !isMultiplayer) {
        startCountdownSequence(data.quoteIndex);
    }

    if (data.players && data.players[oppRole]) {
        const oppData = data.players[oppRole];
        const oppPercent = (oppData.progress / currentQuote.length) * 100;
        oppProgress.style.left = `calc(${oppPercent}% - ${oppPercent * 0.8}px)`;
        oppMpWpm.innerText = oppData.wpm || '0';
        
        if (oppData.finished) {
            if (!isFinished) {
                // opponent finished first
                resultMessage.innerHTML = "Opponent Finished First!";
                resultMessage.classList.add('text-[var(--text-error)]');
                resultMessage.classList.remove('hidden');
            } else if (!matchResult) {
                // both finished, determine winner based on wpm
                const myRole = isHost ? 'host' : 'guest';
                const myData = data.players[myRole];
                if (myData && oppData.wpm > myData.wpm) {
                    matchResult = 'lose';
                } else if (myData && oppData.wpm < myData.wpm) {
                    matchResult = 'win';
                } else {
                    matchResult = 'tie';
                }
            }
        }
    }
}

const listenToRoom = () => {
    if (unsubscribeRoom) {
        unsubscribeRoom();
        unsubscribeRoom = null;
    }

    // ALWAYS listen to LocalStorage as a fallback layer
    const checkLocal = () => {
        const raw = localStorage.getItem(`room_${currentRoomId}`);
        if (raw) handleRoomData(JSON.parse(raw));
    };
    const handleStorage = (e) => {
        if (e.key === `room_${currentRoomId}`) {
            handleRoomData(JSON.parse(e.newValue));
        }
    };
    window.addEventListener('storage', handleStorage);
    const localInterval = setInterval(checkLocal, 500);

    let fbUnsubscribe = null;
    if (firebaseReady) {
        try {
            fbUnsubscribe = onSnapshot(getRoomRef(currentRoomId), (docSnap) => {
                if (docSnap.exists()) handleRoomData(docSnap.data());
            });
        } catch (e) {}
    }

    unsubscribeRoom = () => {
        window.removeEventListener('storage', handleStorage);
        clearInterval(localInterval);
        if (fbUnsubscribe) fbUnsubscribe();
    };
    
    checkLocal();
};

async function startMatch() {
    if (isBotMode) {
        startCountdownSequence(window.botQuoteIndex);
        return;
    }

    if (isHost && !isBotMode) {
        const raw = localStorage.getItem(`room_${currentRoomId}`);
        if (raw) {
            const data = JSON.parse(raw);
            data.status = 'playing';
            localStorage.setItem(`room_${currentRoomId}`, JSON.stringify(data));
        }
        if (firebaseReady) {
            updateDoc(getRoomRef(currentRoomId), { status: 'playing' }).catch(()=>{});
        }
    }
}

function startCountdownSequence(qIndex) {
    isMultiplayer = true;
    vsModal.classList.add('hidden');
    
    // 顯示對手的跑道
    document.getElementById('opp-track').classList.remove('hidden');
    document.getElementById('opp-track').classList.add('flex');

    // 設定跑道標籤
    document.getElementById('my-role-label').innerText = isHost ? "P1 (YOU)" : "P2 (YOU)";
    document.getElementById('opp-role-label').innerText = isHost ? "P2 (OPP)" : "P1 (OPP)";
    
    updateTrackColors();

    restartHint.classList.add('hidden');

    initGame(qIndex);

    // 鎖定打字直到綠燈
    isTypingLocked = true;
    
    tlContainer.classList.remove('hidden');
    tlContainer.classList.add('flex');
    
    // 重設燈號狀態
    lRed.classList.replace('bg-red-500', 'bg-gray-800');
    lRed.classList.remove('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]', 'shadow-[0_0_20px_red]');
    lRed.classList.add('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]');
    
    lYellow.classList.replace('bg-yellow-400', 'bg-gray-800');
    lYellow.classList.remove('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]', 'shadow-[0_0_20px_yellow]');
    lYellow.classList.add('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]');
    
    lGreen.classList.replace('bg-green-500', 'bg-gray-800');
    lGreen.classList.remove('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]', 'shadow-[0_0_20px_green]');
    lGreen.classList.add('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]');

    let count = 10;
    tlCountdown.innerText = count;

    // 前 7 秒亮紅燈
    lRed.classList.replace('bg-gray-800', 'bg-red-500');
    lRed.classList.remove('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]');
    lRed.classList.add('shadow-[0_0_20px_red]');

    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            tlCountdown.innerText = count;
            if (count === 3) {
                // 最後 3 秒亮黃燈
                lRed.classList.replace('bg-red-500', 'bg-gray-800');
                lRed.classList.remove('shadow-[0_0_20px_red]');
                lRed.classList.add('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]');
                
                lYellow.classList.replace('bg-gray-800', 'bg-yellow-400');
                lYellow.classList.remove('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]');
                lYellow.classList.add('shadow-[0_0_20px_yellow]');
            }
        } else {
            clearInterval(countdownInterval);
            tlCountdown.innerText = "GO!";
            // 綠燈
            lYellow.classList.replace('bg-yellow-400', 'bg-gray-800');
            lYellow.classList.remove('shadow-[0_0_20px_yellow]');
            lYellow.classList.add('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]');

            lGreen.classList.replace('bg-gray-800', 'bg-green-500');
            lGreen.classList.remove('shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]');
            lGreen.classList.add('shadow-[0_0_20px_green]');

            isTypingLocked = false;
            if (!startTime) {
                startTime = new Date();
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(calculateStats, 100);
            }

            setTimeout(() => {
                tlContainer.classList.remove('flex');
                tlContainer.classList.add('hidden');
            }, 400);
        }
    }, 1000);
}

// --- 事件監聽 ---
vsBtn.addEventListener('click', openVsModal);
closeVsModal.addEventListener('click', closeVsModalFn);
createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);
startMatchBtn.addEventListener('click', startMatch);
botMatchBtn.addEventListener('click', startBotMatch);
singlePlayerBtn.addEventListener('click', switchToSinglePlayer);
leaveRoomBtn.addEventListener('click', switchToSinglePlayer);
readyBtn.addEventListener('click', setReady);
if (reloadBtn) reloadBtn.addEventListener('click', () => {
    if (!isMultiplayer && !isTypingLocked) {
        initGame();
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        if (!isMultiplayer && !isTypingLocked) {
            initGame();
        }
        return;
    }

    if (isFinished || isTypingLocked) return;

    if (e.key.length !== 1 && e.key !== 'Backspace') return;

    if (!startTime && e.key !== 'Backspace') {
        startTime = new Date();
        timerInterval = setInterval(calculateStats, 100);
    }

    const currentSpan = charElements[currentIndex];

    if (e.key === 'Backspace') {
        if (currentIndex > 0) {
            currentSpan.classList.remove('current');
            currentIndex--;
            const prevSpan = charElements[currentIndex];
            if (prevSpan.classList.contains('correct')) correctCount--;
            prevSpan.className = 'char current';
            playSound('click');

            // Update car position (both single & multiplayer)
            const percent = (correctCount / currentQuote.length) * 100;
            myProgress.style.left = `calc(${percent}% - ${percent * 0.8}px)`;
        }
        return;
    }

    const expectedChar = currentQuote[currentIndex];

    if (e.key === expectedChar) {
        currentSpan.className = 'char correct';
        correctCount++;
        playSound('click');
    } else {
        currentSpan.className = 'char incorrect';
        mistakes++;
        playSound('error');
    }

    currentIndex++;

    // Update car position (both single & multiplayer)
    const percent = (correctCount / currentQuote.length) * 100;
    myProgress.style.left = `calc(${percent}% - ${percent * 0.8}px)`;

    if (isMultiplayer) {
        if (!isBotMode) syncProgressToFirebase();
    }

    if (currentIndex < currentQuote.length) {
        charElements[currentIndex].classList.add('current');
    } else {
        finishGame();
    }
});

window.addEventListener('blur', () => {
    if (!isTypingLocked && !isMultiplayer) {
        focusOverlay.classList.remove('hidden');
    }
});

focusOverlay.addEventListener('click', () => {
    focusOverlay.classList.add('hidden');
});

updateTrackColors();
initGame();
