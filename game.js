// Константы игры
const W = 1200;
const H = 800;
const GROUND_H = 80;

// Константы сложности
const DIFFICULTY_INCREASE_INTERVAL = 15000;
const DIFFICULTY_SPAWN_MULTIPLIER = 0.85;
const DIFFICULTY_SPEED_INCREASE = 0.3;
const MIN_SPAWN_DELAY = 800;
const MIN_SHOOTER_DELAY = 3000;
const INITIAL_SPAWN_DELAY = 3000;
const INITIAL_SHOOTER_DELAY = 20000;
const DEATH_ANIMATION_DURATION = 1000;

// Размеры игровых объектов
const PLAYER_SIZE = 200;
const ENEMY_SIZE = 120;
const SHOOTER_SIZE = 80;
const BARREL_SIZE = 60;

// Физика
const PLAYER_SPEED = 7;
const PLAYER_JUMP_SPEED = -15;
const GRAVITY = 0.7;
const ENTITY_SPEED = 7;
const SHOOTER_INTERVAL = 2000;

// DOM элементы
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const mainScreen = document.getElementById("mainScreen");
const mainMenuMusic = document.getElementById("mainMenuMusic");
const backgroundMusic = document.getElementById("backgroundMusic");
const deathSound = document.getElementById("deathSound");
const jumpSound = document.getElementById("jumpSound");
const howToPlayBtn = document.getElementById("howToPlayBtn");
const howToPlayModal = document.getElementById("howToPlayModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const gameOverModal = document.getElementById("gameOverModal");
const finalScore = document.getElementById("finalScore");
const restartBtn = document.getElementById("restartBtn");
const lastScoreElement = document.getElementById("lastScore");
const mainLastScoreElement = document.getElementById("mainLastScore");

// Игровые переменные
let lastFrameTime = null;
let lastScore = 0;
let bestScore = 0;
let score = 0;

// Никнейм игрока
let playerNickname = localStorage.getItem('siggyjumper_nickname') || '';

// ===== LEADERBOARD — Firebase Realtime Database =====
// Замените YOUR_PROJECT_ID на ID вашего Firebase проекта
// Инструкция: https://console.firebase.google.com → создай проект → Realtime Database
const FIREBASE_URL = 'https://weeklang-default-rtdb.firebaseio.com';
const LB_PATH = '/leaderboard';

// Флаг: используем Firebase или fallback на localStorage
let firebaseAvailable = false;

async function lbCheckFirebase() {
    try {
        const res = await fetch(`${FIREBASE_URL}${LB_PATH}.json?shallow=true`, { signal: AbortSignal.timeout(3000) });
        firebaseAvailable = res.ok;
        console.log('[leaderboard] Firebase доступен:', firebaseAvailable);
    } catch {
        firebaseAvailable = false;
        console.warn('[leaderboard] Firebase недоступен, используем localStorage');
    }
}

// Загрузить все записи (возвращает массив {name, score, wallet?, ts?})
async function lbLoad() {
    if (firebaseAvailable) {
        try {
            const res = await fetch(`${FIREBASE_URL}${LB_PATH}.json`);
            const data = await res.json();
            if (!data) return [];
            // Firebase возвращает объект { key: {name,score,...} }
            const entries = Object.values(data);
            entries.sort((a, b) => b.score - a.score);
            return entries;
        } catch (e) {
            console.warn('[leaderboard] Firebase read error, fallback:', e);
        }
    }
    // Fallback localStorage
    try { return JSON.parse(localStorage.getItem('siggyjumper_leaderboard')) || []; }
    catch { return []; }
}

// Сохранить/обновить результат игрока
async function lbAddScore(nickname, points, walletAddr) {
    if (!nickname || points <= 0) return;

    if (firebaseAvailable) {
        try {
            // Сначала ищем существующую запись этого игрока
            const res = await fetch(
                `${FIREBASE_URL}${LB_PATH}.json?orderBy="name"&equalTo="${encodeURIComponent(nickname)}"`
            );
            const existing = await res.json();

            if (existing && Object.keys(existing).length > 0) {
                // Игрок уже есть — обновляем только если результат лучше
                const key = Object.keys(existing)[0];
                const oldScore = existing[key].score || 0;
                if (points > oldScore) {
                    await fetch(`${FIREBASE_URL}${LB_PATH}/${key}.json`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ score: points, ts: Date.now(), wallet: walletAddr || null })
                    });
                }
            } else {
                // Новый игрок
                await fetch(`${FIREBASE_URL}${LB_PATH}.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: nickname,
                        score: points,
                        wallet: walletAddr || null,
                        ts: Date.now()
                    })
                });
            }
            return;
        } catch (e) {
            console.warn('[leaderboard] Firebase write error, fallback:', e);
        }
    }

    // Fallback localStorage
    try {
        const entries = JSON.parse(localStorage.getItem('siggyjumper_leaderboard')) || [];
        const ex = entries.find(e => e.name === nickname);
        if (ex) { if (points > ex.score) ex.score = points; }
        else entries.push({ name: nickname, score: points });
        entries.sort((a, b) => b.score - a.score);
        localStorage.setItem('siggyjumper_leaderboard', JSON.stringify(entries));
    } catch {}
}

// Инициализируем соединение с Firebase при загрузке страницы
lbCheckFirebase();

// ===== NICKNAME MODAL =====
function createNicknameModal() {
    if (document.getElementById('nicknameModal')) return;
    const modal = document.createElement('div');
    modal.id = 'nicknameModal';
    modal.style.cssText = `
        display:none; position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.88); z-index:8000;
        justify-content:center; align-items:center;
    `;
    modal.innerHTML = `
        <div style="
            background:rgba(13,13,30,0.98); padding:50px 60px;
            border:5px solid #1fffb0; border-radius:18px;
            max-width:480px; width:90%; text-align:center;
            box-shadow:0 0 60px rgba(31,255,176,0.25);
        ">
            <div style="font-size:48px; margin-bottom:10px;">🎮</div>
            <h2 style="
                font-family:'SuperMario',sans-serif; color:#1fffb0;
                font-size:34px; margin:0 0 8px;
                text-shadow:2px 2px 4px black;
            ">Enter Nickname</h2>
            <p style="color:#888; font-family:monospace; font-size:13px; margin:0 0 28px;">
                Your name will appear on the leaderboard
            </p>
            <input id="nicknameInput" type="text" maxlength="16" placeholder="YourName"
                style="
                    font-family:'SuperMario',sans-serif; font-size:22px;
                    color:#1fffb0; background:rgba(0,0,0,0.6);
                    border:3px solid #59E09D; border-radius:10px;
                    padding:12px 20px; width:100%; text-align:center;
                    outline:none; box-sizing:border-box; margin-bottom:20px;
                    letter-spacing:2px;
                "
            />
            <button id="nicknameConfirmBtn" style="
                font-family:'SuperMario',sans-serif; font-size:22px;
                color:#0d0d0d; background:linear-gradient(135deg,#1fffb0,#59E09D);
                padding:14px 40px; border:none; border-radius:10px;
                cursor:pointer; width:100%; transition:all 0.3s;
                box-shadow:0 4px 20px rgba(31,255,176,0.4);
            ">Let's Go!</button>
            <p id="nicknameError" style="
                color:#ff4444; font-family:monospace; font-size:13px;
                margin-top:12px; min-height:18px;
            "></p>
        </div>
    `;
    document.body.appendChild(modal);

    const input   = modal.querySelector('#nicknameInput');
    const confirm = modal.querySelector('#nicknameConfirmBtn');
    const errEl   = modal.querySelector('#nicknameError');

    // Если уже есть сохранённый ник — подставляем
    if (playerNickname) input.value = playerNickname;

    confirm.onmouseover = () => { confirm.style.transform = 'scale(1.03)'; };
    confirm.onmouseout  = () => { confirm.style.transform = 'scale(1)'; };

    confirm.addEventListener('click', () => {
        const val = input.value.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
        if (!val || val.length < 2) {
            errEl.textContent = 'Min 2 characters (letters, digits, _ - .)';
            return;
        }
        errEl.textContent = '';
        playerNickname = val;
        localStorage.setItem('siggyjumper_nickname', val);
        modal.style.display = 'none';
        _nicknameResolve && _nicknameResolve(val);
        _nicknameResolve = null;
    });

    input.addEventListener('keydown', (e) => {
        if (e.code === 'Enter') confirm.click();
        e.stopPropagation(); // не запускаем игру по Enter в инпуте
    });
}

let _nicknameResolve = null;

function askNickname() {
    return new Promise((resolve) => {
        createNicknameModal();
        const modal = document.getElementById('nicknameModal');
        const input = document.getElementById('nicknameInput');
        if (playerNickname) input.value = playerNickname;
        _nicknameResolve = resolve;
        modal.style.display = 'flex';
        setTimeout(() => input.focus(), 100);
    });
}

// ===== LEADERBOARD UI (модалка) =====
async function renderLeaderboard() {
    const body  = document.getElementById('leaderboardBody');
    const empty = document.getElementById('leaderboardEmpty');
    if (!body) return;

    body.innerHTML = `<tr><td colspan="3" style="color:#555;font-family:monospace;font-size:13px;padding:20px;text-align:center;">Loading...</td></tr>`;
    if (empty) empty.style.display = 'none';

    const entries = await lbLoad();
    body.innerHTML = '';

    if (!entries || entries.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    entries.forEach((e, i) => {
        const tr = document.createElement('tr');
        const walletShort = e.wallet
            ? `<span style="font-size:10px;color:#555;font-family:monospace;"> ${e.wallet.slice(0,6)}…${e.wallet.slice(-4)}</span>`
            : '';
        tr.innerHTML = `
            <td style="color:#888;font-size:13px;padding:8px 6px;">${i + 1}</td>
            <td style="padding:8px 6px;">${e.name}${walletShort}</td>
            <td style="text-align:right;color:#1fffb0;padding:8px 6px;">${e.score}</td>
        `;
        body.appendChild(tr);
    });
}
let spawnDelay = INITIAL_SPAWN_DELAY;
let shooterSpawnDelay = INITIAL_SHOOTER_DELAY;
let lastSpawnTime = Date.now();
let lastShooterSpawnTime = Date.now();
let gameStartTime = Date.now();
let difficultyIncreaseInterval = DIFFICULTY_INCREASE_INTERVAL;
let deathTime = null;
let gameOverShown = false;

let startGameHandler = null;
let restartGameHandler = null;
let gameLoopId = null; // ID текущего requestAnimationFrame — чтобы не запускать два цикла

// Загрузка изображений
const backgroundWithGround = new Image();
backgroundWithGround.src = "background_with_ground.png";

const playerImage = new Image();
playerImage.src = "siggy.png";

const playerImageLeft = new Image();
playerImageLeft.src = "siggy_left.png";

// mob2 — идёт вправо (оригинал) и влево (зеркало)
const enemyImage = new Image();
enemyImage.src = "mob2.png";
const enemyImageLeft = new Image();
enemyImageLeft.src = "mob2_left.png";
const enemyDeadImage = new Image();
enemyDeadImage.src = "mob2_dead.png";
const enemyDeadImageLeft = new Image();
enemyDeadImageLeft.src = "mob2_dead_left.png";

// mob3
const enemyImage2 = new Image();
enemyImage2.src = "mob3.png";
const enemyImage2Left = new Image();
enemyImage2Left.src = "mob3_left.png";
const enemyDeadImage2 = new Image();
enemyDeadImage2.src = "mob3_dead.png";
const enemyDeadImage2Left = new Image();
enemyDeadImage2Left.src = "mob3_dead_left.png";

// mob1
const enemyImage3 = new Image();
enemyImage3.src = "images/mob1.png";
const enemyImage3Left = new Image();
enemyImage3Left.src = "images/mob1_left.png";
const enemyDeadImage3 = new Image();
enemyDeadImage3.src = "images/mob1_dead.png";
const enemyDeadImage3Left = new Image();
enemyDeadImage3Left.src = "images/mob1_dead_left.png";

const shooterImage = new Image();
shooterImage.src = "shooter.png";

const barrelImage = new Image();
barrelImage.src = "barrel.gif";

// Базовый класс сущности
class Entity {
    constructor(image, width, height) {
        this.image = image;
        this.width = width;
        this.height = height;
        this.x = 0;
        this.y = 0;
        this.xSpeed = 0;
        this.ySpeed = 0;
        this.speed = ENTITY_SPEED;
        this.jumpSpeed = PLAYER_JUMP_SPEED;
        this.gravity = GRAVITY;
        this.isGrounded = false;
        this.isDead = false;
        this.isOut = false;
    }

    update(deltaTime) {
        const dt = deltaTime * 60;
        this.x += this.xSpeed * dt;
        this.y += this.ySpeed * dt;
        this.ySpeed += this.gravity * dt;

        if (!this.isDead && this.y + this.height > H - GROUND_H) {
            this.isGrounded = true;
            this.ySpeed = 0;
            this.y = H - GROUND_H - this.height;
        } else {
            this.isGrounded = false;
        }
    }

    draw() {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
}

// Класс игрока
class Player extends Entity {
    constructor() {
        super(playerImage, PLAYER_SIZE, PLAYER_SIZE);
        this.x = W / 2 - this.width / 2;
        this.y = H - GROUND_H - this.height;
        this.imageRight = playerImage;
        this.imageLeft = playerImageLeft;
        this.speed = PLAYER_SPEED;
        this.prevY = this.y;
        this.lastDirection = 'right';
    }

    handleInput(keys) {
        if (this.isDead) return;

        this.xSpeed = 0;

        if (keys["KeyA"] || keys["ArrowLeft"]) {
            this.xSpeed = -this.speed;
            this.image = this.imageLeft;
            this.lastDirection = 'left';
        }

        if (keys["KeyD"] || keys["ArrowRight"]) {
            this.xSpeed = this.speed;
            this.image = this.imageRight;
            this.lastDirection = 'right';
        }

        if (!keys["KeyA"] && !keys["KeyD"] && !keys["ArrowLeft"] && !keys["ArrowRight"]) {
            this.image = this.lastDirection === 'left' ? this.imageLeft : this.imageRight;
        }

        if (this.isGrounded && (keys["Space"] || keys["ArrowUp"])) {
            this.isGrounded = false;
            this.ySpeed = this.jumpSpeed;
            jumpSound.currentTime = 0;
            jumpSound.play();
        }
    }

    update(deltaTime) {
        this.prevY = this.y;

        const dt = deltaTime * 60;
        this.x += this.xSpeed * dt;
        this.y += this.ySpeed * dt;
        this.ySpeed += this.gravity * dt;

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > W) this.x = W - this.width;

        if (!this.isDead && this.y + this.height > H - GROUND_H) {
            this.isGrounded = true;
            this.ySpeed = 0;
            this.y = H - GROUND_H - this.height;
        } else {
            this.isGrounded = false;
        }
    }

    kill() {
        this.isDead = true;
        this.xSpeed = 0;
        this.ySpeed = -10;
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;
        deathSound.currentTime = 0;
        deathSound.play();
    }

    respawn() {
        this.isDead = false;
        this.x = W / 2 - this.width / 2;
        this.y = H - GROUND_H - this.height;
        this.prevY = this.y;
        this.ySpeed = 0;
        this.lastDirection = 'right';
        this.image = this.imageRight;
    }
}

// Универсальный класс врага с отдельными картинками для каждого направления
class Enemy extends Entity {
    constructor(imgRight, imgLeft, deadImgRight, deadImgLeft, size = ENEMY_SIZE) {
        super(imgRight, size, size);
        this.imgRight = imgRight;
        this.imgLeft = imgLeft;
        this.deadImgRight = deadImgRight;
        this.deadImgLeft = deadImgLeft;
        this.spawn();
    }

    spawn() {
        const direction = Math.random() < 0.5 ? 0 : 1;
        if (direction === 0) {
            // Спавн слева — идёт вправо — зеркало (оригинал смотрит влево)
            this.x = -this.width;
            this.xSpeed = this.speed;
            this.image = this.imgLeft;
            this.deadImage = this.deadImgLeft;
        } else {
            // Спавн справа — идёт влево — оригинал
            this.x = W;
            this.xSpeed = -this.speed;
            this.image = this.imgRight;
            this.deadImage = this.deadImgRight;
        }
        this.y = 0;
    }

    update(deltaTime) {
        super.update(deltaTime);
        if (this.x > W || this.x + this.width < 0) {
            this.isOut = true;
        }
    }

    draw() {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }

    kill() {
        this.isDead = true;
        this.image = this.deadImage;
        this.xSpeed = 0;
        this.ySpeed = 0;
    }
}

// Класс стреляющего врага
class BarrelShooter extends Entity {
    constructor() {
        super(shooterImage, SHOOTER_SIZE, SHOOTER_SIZE);
        this.x = Math.random() * (W - this.width);
        this.y = -this.height;
        this.shootInterval = SHOOTER_INTERVAL;
        this.lastShotTime = Date.now();

        const gameTime = Date.now() - gameStartTime;
        const difficultyLevel = Math.floor(gameTime / DIFFICULTY_INCREASE_INTERVAL);
        this.shotsLeft = Math.floor(Math.random() * 3) + 1 + difficultyLevel;

        this.isLeaving = false;
    }

    update(deltaTime) {
        const dt = deltaTime * 60;

        if (!this.isLeaving) {
            if (this.y < 100) {
                this.y += this.speed * dt;
            }

            const now = Date.now();
            if (this.shotsLeft > 0 && now - this.lastShotTime > this.shootInterval) {
                const barrel = new Barrel(this.x + this.width / 2 - BARREL_SIZE / 2);
                barrels.push(barrel);
                this.lastShotTime = now;
                this.shotsLeft--;

                if (this.shotsLeft === 0) {
                    this.isLeaving = true;
                }
            }
        } else {
            this.y -= this.speed * dt;
            if (this.y + this.height < 0) {
                this.isOut = true;
            }
        }
    }

    draw() {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = 6;
        ctx.strokeRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
    }
}

// Класс бочки
class Barrel extends Entity {
    constructor(x) {
        super(barrelImage, BARREL_SIZE, BARREL_SIZE);
        this.x = x;
        this.y = 100;
        this.ySpeed = 0;
        this.isOut = false;
    }

    update(deltaTime) {
        const dt = deltaTime * 60;
        this.y += this.ySpeed * dt;
        this.ySpeed += this.gravity * dt;

        if (this.y > H) {
            this.isOut = true;
        }
    }

    draw() {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        ctx.strokeStyle = "#AA00FF";
        ctx.lineWidth = 4;
        ctx.strokeRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
    }
}

// Игровые объекты
const player = new Player();
const enemies = [];
const barrelShooters = [];
const barrels = [];

// Управление
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup", (e) => (keys[e.code] = false));

// Автоматический запуск музыки
window.addEventListener('load', function () {
    mainMenuMusic.play().catch(() => {
        document.addEventListener("click", function () {
            mainMenuMusic.play().catch(e => console.error(e));
        }, { once: true });
    });
});

howToPlayBtn.addEventListener("click", () => { howToPlayModal.style.display = "flex"; });
closeModalBtn.addEventListener("click", () => { howToPlayModal.style.display = "none"; });
restartBtn.addEventListener("click", () => { restartGame(); });

// Leaderboard modal
document.getElementById("leaderboardBtn").addEventListener("click", () => {
    renderLeaderboard();
    document.getElementById("leaderboardModal").style.display = "flex";
});
document.getElementById("closeLeaderboardBtn").addEventListener("click", () => {
    document.getElementById("leaderboardModal").style.display = "none";
});

// Главный игровой цикл
function gameLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const deltaTime = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    ctx.drawImage(backgroundWithGround, 0, 0, W, H);

    player.handleInput(keys);
    player.update(deltaTime);
    player.draw();

    const now = Date.now();
    const gameTime = now - gameStartTime;

    // Увеличение сложности
    if (gameTime > difficultyIncreaseInterval) {
        spawnDelay = Math.max(MIN_SPAWN_DELAY, spawnDelay * DIFFICULTY_SPAWN_MULTIPLIER);
        shooterSpawnDelay = Math.max(MIN_SHOOTER_DELAY, shooterSpawnDelay * DIFFICULTY_SPAWN_MULTIPLIER);
        difficultyIncreaseInterval += DIFFICULTY_INCREASE_INTERVAL;
    }

    // Спавн врагов
    if (now - lastSpawnTime > spawnDelay) {
        const enemyType = Math.random();
        let newEnemy;

        if (enemyType < 0.33) {
            newEnemy = new Enemy(enemyImage, enemyImageLeft, enemyDeadImage, enemyDeadImageLeft, ENEMY_SIZE);
        } else if (enemyType < 0.66) {
            newEnemy = new Enemy(enemyImage2, enemyImage2Left, enemyDeadImage2, enemyDeadImage2Left, ENEMY_SIZE);
        } else {
            newEnemy = new Enemy(enemyImage3, enemyImage3Left, enemyDeadImage3, enemyDeadImage3Left, ENEMY_SIZE);
        }

        newEnemy.speed += Math.floor(gameTime / DIFFICULTY_INCREASE_INTERVAL) * DIFFICULTY_SPEED_INCREASE;
        enemies.push(newEnemy);
        lastSpawnTime = now;
    }

    // Спавн стреляющих врагов
    if (now - lastShooterSpawnTime > shooterSpawnDelay) {
        barrelShooters.push(new BarrelShooter());
        lastShooterSpawnTime = now;
    }

    // Обновление врагов
    let playerKilledEnemy = false;

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update(deltaTime);
        enemy.draw();

        if (enemy.isOut) { enemies.splice(i, 1); continue; }

        if (!player.isDead && !enemy.isDead && isColliding(player, enemy)) {
            if (player.prevY + player.height <= enemy.y + 20 && player.ySpeed > 0) {
                enemy.kill();
                playerKilledEnemy = true;
                score++;
            } else if (!playerKilledEnemy) {
                player.kill();
                deathTime = now;
            }
        }
    }

    if (playerKilledEnemy && !player.isDead) {
        player.ySpeed = player.jumpSpeed;
    }

    // Обновление стреляющих врагов
    for (let i = barrelShooters.length - 1; i >= 0; i--) {
        const shooter = barrelShooters[i];
        shooter.update(deltaTime);
        shooter.draw();

        if (shooter.isOut) { barrelShooters.splice(i, 1); continue; }

        if (!player.isDead && isColliding(player, shooter)) {
            player.kill();
            deathTime = now;
        }
    }

    // Обновление бочек
    for (let i = barrels.length - 1; i >= 0; i--) {
        const barrel = barrels[i];
        barrel.update(deltaTime);
        barrel.draw();

        if (barrel.isOut) { barrels.splice(i, 1); continue; }

        if (!player.isDead && isColliding(player, barrel)) {
            player.kill();
            deathTime = now;
        }
    }

    drawScore();

    if (player.isDead) {
        if (player.y > H || (deathTime && now - deathTime > DEATH_ANIMATION_DURATION)) {
            if (!gameOverShown) {
                showGameOverModal();
                gameOverShown = true;
            }
            // Не продолжаем цикл после game over — ждём рестарта
            gameLoopId = null;
            return;
        }
    }

    gameLoopId = requestAnimationFrame(gameLoop);
}

function drawScore() {
    const scoreX = W / 2 - 70;
    const scoreY = 20;
    const boxWidth = 140;
    const boxHeight = 60;

    ctx.strokeStyle = "#F2805A";
    ctx.lineWidth = 4;
    ctx.strokeRect(scoreX, scoreY, boxWidth, boxHeight);

    ctx.fillStyle = "white";
    ctx.font = "20px SuperMario";
    ctx.textAlign = "center";
    ctx.fillText("SCORE", scoreX + boxWidth / 2, scoreY + 25);

    ctx.font = "28px SuperMario";
    ctx.fillText(score, scoreX + boxWidth / 2, scoreY + 50);
}

function isColliding(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

function showGameOverModal() {
    if (score > bestScore) bestScore = score;

    // Сохраняем результат в лидерборд (с адресом кошелька если подключён)
    const walletAddr = window.walletState?.address || null;
    lbAddScore(playerNickname, score, walletAddr);

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, W, H);

    const boxWidth = 600;
    const boxHeight = 420;
    const boxX = W / 2 - boxWidth / 2;
    const boxY = H / 2 - boxHeight / 2;

    ctx.fillStyle = "rgba(20, 20, 40, 0.95)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    ctx.strokeStyle = "#ff69b4";
    ctx.lineWidth = 8;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    ctx.fillStyle = "#ff0000";
    ctx.font = "bold 80px SuperMario";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", W / 2, boxY + 100);

    // Показываем ник
    if (playerNickname) {
        ctx.fillStyle = "#1fffb0";
        ctx.font = "24px SuperMario";
        ctx.fillText(playerNickname, W / 2, boxY + 145);
    }

    ctx.fillStyle = "white";
    ctx.font = "40px SuperMario";
    ctx.fillText("Your score: " + score, W / 2, boxY + 200);

    ctx.fillStyle = "#FFD700";
    ctx.font = "35px SuperMario";
    ctx.fillText("Best score: " + bestScore, W / 2, boxY + 255);

    ctx.fillStyle = "#aaaaaa";
    ctx.font = "25px SuperMario";
    ctx.fillText("Press Space or Enter", W / 2, boxY + 340);
    ctx.fillText("to restart", W / 2, boxY + 375);

    setupRestartListener();
}

function setupRestartListener() {
    if (restartGameHandler) window.removeEventListener("keydown", restartGameHandler);
    restartGameHandler = (e) => {
        if (e.code === "Space" || e.code === "Enter") restartGame();
    };
    window.addEventListener("keydown", restartGameHandler);
}

function setupStartListener() {
    if (startGameHandler) window.removeEventListener("keydown", startGameHandler);
    startGameHandler = (e) => {
        if (e.code === "Space" || e.code === "Enter") startGame();
    };
    window.addEventListener("keydown", startGameHandler);
}

function restartGame() {
    lastScore = score;
    if (lastScoreElement) lastScoreElement.textContent = lastScore;
    if (mainLastScoreElement) mainLastScoreElement.textContent = lastScore;

    // Останавливаем игровой цикл
    if (gameLoopId !== null) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }

    score = 0;
    spawnDelay = INITIAL_SPAWN_DELAY;
    shooterSpawnDelay = INITIAL_SHOOTER_DELAY;
    lastSpawnTime = Date.now();
    lastShooterSpawnTime = Date.now();
    gameStartTime = Date.now();
    difficultyIncreaseInterval = DIFFICULTY_INCREASE_INTERVAL;
    lastFrameTime = null;
    deathTime = null;
    gameOverShown = false;

    player.respawn();
    enemies.length = 0;
    barrelShooters.length = 0;
    barrels.length = 0;

    // Сбрасываем все звуки
    deathSound.pause();
    deathSound.currentTime = 0;
    jumpSound.pause();
    jumpSound.currentTime = 0;
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;

    // Сбрасываем зажатые клавиши
    for (const key in keys) delete keys[key];

    mainMenuMusic.currentTime = 0;
    mainMenuMusic.play().catch(e => console.error(e));

    mainScreen.style.display = "flex";
    canvas.style.display = "none";
    gameOverModal.style.display = "none";

    const hud = document.getElementById("gameWalletHud");
    if (hud) hud.style.display = "none";

    if (restartGameHandler) {
        window.removeEventListener("keydown", restartGameHandler);
        restartGameHandler = null;
    }

    renderLeaderboard();
    setupStartListener();
}

async function startGame() {
    // Убираем слушатель клавиш
    if (startGameHandler) {
        window.removeEventListener("keydown", startGameHandler);
        startGameHandler = null;
    }

    // Запрашиваем никнейм (если ещё не введён или хочет поменять)
    if (!playerNickname) {
        const nick = await askNickname();
        if (!nick) { setupStartListener(); return; }
    }

    // Показываем модалку оплаты (если кошелёк подключён)
    const canPlay = await window.requestPayToPlay();
    if (!canPlay) {
        setupStartListener();
        return;
    }

    // Останавливаем предыдущий игровой цикл
    if (gameLoopId !== null) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }

    // Полный сброс состояния игры
    score = 0;
    spawnDelay = INITIAL_SPAWN_DELAY;
    shooterSpawnDelay = INITIAL_SHOOTER_DELAY;
    lastSpawnTime = Date.now();
    lastShooterSpawnTime = Date.now();
    gameStartTime = Date.now();
    difficultyIncreaseInterval = DIFFICULTY_INCREASE_INTERVAL;
    lastFrameTime = null;
    deathTime = null;
    gameOverShown = false;

    player.respawn();
    enemies.length = 0;
    barrelShooters.length = 0;
    barrels.length = 0;

    deathSound.pause();
    deathSound.currentTime = 0;
    jumpSound.pause();
    jumpSound.currentTime = 0;
    for (const key in keys) delete keys[key];

    mainScreen.style.display = "none";
    howToPlayModal.style.display = "none";
    gameOverModal.style.display = "none";
    canvas.style.display = "block";

    const hud = document.getElementById("gameWalletHud");
    if (window.walletState && window.walletState.connected) {
        hud.style.display = "block";
    }

    mainMenuMusic.pause();
    mainMenuMusic.currentTime = 0;
    backgroundMusic.currentTime = 0;
    backgroundMusic.play().catch(e => console.error(e));

    gameLoopId = requestAnimationFrame(gameLoop);
}

// Загрузка изображений — считаем и успехи и ошибки, чтобы игра всегда запустилась
let imagesLoaded = 0;
const totalImages = 17;

function imageLoaded() {
    imagesLoaded++;
    if (imagesLoaded === totalImages) {
        if (mainLastScoreElement) mainLastScoreElement.textContent = lastScore;
        renderLeaderboard();
        setupStartListener();
    }
}

function imageError(name) {
    console.error(`Ошибка загрузки: ${name}`);
    // Считаем ошибку как загруженную, чтобы игра не зависла
    imageLoaded();
}

backgroundWithGround.onload = imageLoaded; backgroundWithGround.onerror = () => imageError("background_with_ground.png");
playerImage.onload = imageLoaded; playerImage.onerror = () => imageError("siggy.png");
playerImageLeft.onload = imageLoaded; playerImageLeft.onerror = () => imageError("siggy_left.png");

enemyImage.onload = imageLoaded; enemyImage.onerror = () => imageError("mob2.png");
enemyImageLeft.onload = imageLoaded; enemyImageLeft.onerror = () => imageError("mob2_left.png");
enemyDeadImage.onload = imageLoaded; enemyDeadImage.onerror = () => imageError("mob2_dead.png");
enemyDeadImageLeft.onload = imageLoaded; enemyDeadImageLeft.onerror = () => imageError("mob2_dead_left.png");

enemyImage2.onload = imageLoaded; enemyImage2.onerror = () => imageError("mob3.png");
enemyImage2Left.onload = imageLoaded; enemyImage2Left.onerror = () => imageError("mob3_left.png");
enemyDeadImage2.onload = imageLoaded; enemyDeadImage2.onerror = () => imageError("mob3_dead.png");
enemyDeadImage2Left.onload = imageLoaded; enemyDeadImage2Left.onerror = () => imageError("mob3_dead_left.png");

enemyImage3.onload = imageLoaded; enemyImage3.onerror = () => imageError("images/mob1.png");
enemyImage3Left.onload = imageLoaded; enemyImage3Left.onerror = () => imageError("images/mob1_left.png");
enemyDeadImage3.onload = imageLoaded; enemyDeadImage3.onerror = () => imageError("images/mob1_dead.png");
enemyDeadImage3Left.onload = imageLoaded; enemyDeadImage3Left.onerror = () => imageError("images/mob1_dead_left.png");

shooterImage.onload = imageLoaded; shooterImage.onerror = () => imageError("shooter.png");
barrelImage.onload = imageLoaded; barrelImage.onerror = () => imageError("barrel.gif");

// ===== LEADERBOARD BUTTON =====
document.addEventListener('DOMContentLoaded', () => {
    const lbBtn = document.getElementById('leaderboardBtn');
    const lbModal = document.getElementById('leaderboardModal');
    const closeLbBtn = document.getElementById('closeLeaderboardBtn');

    if (lbBtn) {
        lbBtn.addEventListener('click', () => {
            lbModal.style.display = 'flex';
            renderLeaderboard();
        });
    }
    if (closeLbBtn) {
        closeLbBtn.addEventListener('click', () => {
            lbModal.style.display = 'none';
        });
    }
});