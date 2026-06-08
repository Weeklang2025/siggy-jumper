// Константы игры
const W = 1200;
const H = 800;
const GROUND_H = 80;

// Константы сложности
const DIFFICULTY_INCREASE_INTERVAL = 15000; // Каждые 15 секунд
const DIFFICULTY_SPAWN_MULTIPLIER = 0.85; // Быстрее спавн
const DIFFICULTY_SPEED_INCREASE = 0.3; // Больше прибавка к скорости
const MIN_SPAWN_DELAY = 800; // Минимальная задержка между врагами
const MIN_SHOOTER_DELAY = 3000; // Минимальная задержка между стрелками
const INITIAL_SPAWN_DELAY = 3000; // Начальная задержка - больше
const INITIAL_SHOOTER_DELAY = 20000; // Стрелки появляются позже
const DEATH_ANIMATION_DURATION = 1000;

// Размеры игровых объектов
const PLAYER_SIZE = 200;
const ENEMY_SIZE = 80; // Все враги одного размера
const SHOOTER_SIZE = 80;
const BARREL_SIZE = 70;

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
let spawnDelay = INITIAL_SPAWN_DELAY;
let shooterSpawnDelay = INITIAL_SHOOTER_DELAY;
let lastSpawnTime = Date.now();
let lastShooterSpawnTime = Date.now();
let gameStartTime = Date.now();
let difficultyIncreaseInterval = DIFFICULTY_INCREASE_INTERVAL;
let deathTime = null;
let gameOverShown = false;

// Обработчики событий
let startGameHandler = null;
let restartGameHandler = null;

// Загрузка изображений
const backgroundWithGround = new Image();
backgroundWithGround.src = "background_with_ground.png";

const playerImage = new Image();
playerImage.src = "siggy.png";

const playerImageLeft = new Image();
playerImageLeft.src = "siggy_left.png";

const enemyImage = new Image();
enemyImage.src = "mob2.png";

const enemyDeadImage = new Image();
enemyDeadImage.src = "mob2_dead.png";

const enemyImage2 = new Image();
enemyImage2.src = "mob3.png";

const enemyDeadImage2 = new Image();
enemyDeadImage2.src = "mob3_dead.png";

const enemyImage3 = new Image();
enemyImage3.src = "images/mob1.png";

const enemyDeadImage3 = new Image();
enemyDeadImage3.src = "images/mob1_dead.png";

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
    }

    handleInput(keys) {
        if (this.isDead) return;

        this.xSpeed = 0;
        
        if (keys["KeyA"] || keys["ArrowLeft"]) {
            this.xSpeed = -this.speed;
            this.image = this.imageLeft;
        }
        
        if (keys["KeyD"] || keys["ArrowRight"]) {
            this.xSpeed = this.speed;
            this.image = this.imageRight;
        }
        
        if (!keys["KeyA"] && !keys["KeyD"] && !keys["ArrowLeft"] && !keys["ArrowRight"]) {
            this.image = this.imageRight;
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
        this.image = this.imageRight;
    }
}

// Универсальный класс врага
class Enemy extends Entity {
    constructor(image, deadImage, size = ENEMY_SIZE) {
        super(image, size, size);
        this.deadImage = deadImage;
        this.spawn();
    }

    spawn() {
        const direction = Math.random() < 0.5 ? 0 : 1;
        if (direction === 0) {
            this.x = -this.width;
            this.xSpeed = this.speed;
        } else {
            this.x = W;
            this.xSpeed = -this.speed;
        }
        this.y = 0;
    }

    update(deltaTime) {
        super.update(deltaTime);
        if (this.x > W || this.x + this.width < 0) {
            this.isOut = true;
        }
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
        
        // Количество выстрелов зависит от времени игры
        const gameTime = Date.now() - gameStartTime;
        const difficultyLevel = Math.floor(gameTime / DIFFICULTY_INCREASE_INTERVAL);
        this.shotsLeft = Math.floor(Math.random() * 3) + 1 + difficultyLevel; // Больше выстрелов со временем
        
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

// Автоматический запуск музыки при загрузке страницы
window.addEventListener('load', function() {
    // Пытаемся запустить музыку автоматически
    mainMenuMusic.play().catch(error => {
        console.log("Автозапуск заблокирован браузером, ожидаем взаимодействия");
        // Если автозапуск заблокирован, запускаем при первом клике
        document.addEventListener("click", function() {
            mainMenuMusic.play().catch(error => console.error("Ошибка воспроизведения:", error));
        }, { once: true });
    });
});

// Модальное окно "Как играть"
howToPlayBtn.addEventListener("click", () => {
    howToPlayModal.style.display = "flex";
});

closeModalBtn.addEventListener("click", () => {
    howToPlayModal.style.display = "none";
});

restartBtn.addEventListener("click", () => {
    restartGame();
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
        
        // Визуальное уведомление об увеличении сложности
        console.log(`Сложность увеличена! Уровень: ${Math.floor(gameTime / DIFFICULTY_INCREASE_INTERVAL)}`);
    }

    // Спавн врагов
    if (now - lastSpawnTime > spawnDelay) {
        const enemyType = Math.random();
        let newEnemy;
        
        if (enemyType < 0.33) {
            newEnemy = new Enemy(enemyImage, enemyDeadImage, ENEMY_SIZE);
        } else if (enemyType < 0.66) {
            newEnemy = new Enemy(enemyImage2, enemyDeadImage2, ENEMY_SIZE);
        } else {
            newEnemy = new Enemy(enemyImage3, enemyDeadImage3, ENEMY_SIZE);
        }
        
        newEnemy.speed += Math.floor(gameTime / DIFFICULTY_INCREASE_INTERVAL) * DIFFICULTY_SPEED_INCREASE;
        enemies.push(newEnemy);
        lastSpawnTime = now;
    }

    // Спавн стреляющих врагов
    if (now - lastShooterSpawnTime > shooterSpawnDelay) {
        const newShooter = new BarrelShooter();
        barrelShooters.push(newShooter);
        lastShooterSpawnTime = now;
    }

    // Обновление врагов
    let playerKilledEnemy = false;
    
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update(deltaTime);
        enemy.draw();

        if (enemy.isOut) {
            enemies.splice(i, 1);
            continue;
        }

        if (!player.isDead && !enemy.isDead && isColliding(player, enemy)) {
            // Проверяем, прыгает ли игрок сверху
            if (player.prevY + player.height <= enemy.y + 20 && player.ySpeed > 0) {
                enemy.kill();
                playerKilledEnemy = true;
                score++;
            } else if (!playerKilledEnemy) {
                // Игрок погибает только если не убил врага прыжком
                player.kill();
                deathTime = now;
            }
        }
    }
    
    // Если игрок убил врага прыжком, подпрыгиваем
    if (playerKilledEnemy && !player.isDead) {
        player.ySpeed = player.jumpSpeed;
    }

    // Обновление стреляющих врагов
    for (let i = barrelShooters.length - 1; i >= 0; i--) {
        const shooter = barrelShooters[i];
        shooter.update(deltaTime);
        shooter.draw();

        if (shooter.isOut) {
            barrelShooters.splice(i, 1);
            continue;
        }

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

        if (barrel.isOut) {
            barrels.splice(i, 1);
            continue;
        }

        if (!player.isDead && isColliding(player, barrel)) {
            player.kill();
            deathTime = now;
        }
    }

    // Отображение счёта
    drawScore();

    // Проверка состояния игры
    if (player.isDead) {
        if (player.y > H || (deathTime && now - deathTime > DEATH_ANIMATION_DURATION)) {
            if (!gameOverShown) {
                showGameOverModal();
                gameOverShown = true;
            } else {
                // Продолжаем отрисовывать Game Over экран
                showGameOverModal();
            }
        }
        requestAnimationFrame(gameLoop);
    } else {
        requestAnimationFrame(gameLoop);
    }
}

// Отрисовка счёта
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

// Проверка столкновений
function isColliding(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

// Показ Game Over прямо на canvas
function showGameOverModal() {
    // Обновляем лучший счёт
    if (score > bestScore) {
        bestScore = score;
    }
    
    // Рисуем полупрозрачный оверлей
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, W, H);
    
    // Рамка для окна Game Over
    const boxWidth = 600;
    const boxHeight = 400;
    const boxX = W / 2 - boxWidth / 2;
    const boxY = H / 2 - boxHeight / 2;
    
    // Фон окна
    ctx.fillStyle = "rgba(20, 20, 40, 0.95)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Рамка окна
    ctx.strokeStyle = "#ff69b4";
    ctx.lineWidth = 8;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    
    // Текст "GAME OVER"
    ctx.fillStyle = "#ff0000";
    ctx.font = "bold 80px SuperMario";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", W / 2, boxY + 100);
    
    // Текст "Ваш счёт"
    ctx.fillStyle = "white";
    ctx.font = "40px SuperMario";
    ctx.fillText("Your score: " + score, W / 2, boxY + 180);
    
    // Текст "Лучший счёт"
    ctx.fillStyle = "#FFD700";
    ctx.font = "35px SuperMario";
    ctx.fillText("Best score: " + bestScore, W / 2, boxY + 240);
    
    // Подсказка для рестарта
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "25px SuperMario";
    ctx.fillText("Press Space or Enter", W / 2, boxY + 320);
    ctx.fillText("to restart", W / 2, boxY + 355);
    
    setupRestartListener();
}

// Настройка слушателя для рестарта
function setupRestartListener() {
    if (restartGameHandler) {
        window.removeEventListener("keydown", restartGameHandler);
    }
    restartGameHandler = (e) => {
        if (e.code === "Space" || e.code === "Enter") {
            restartGame();
        }
    };
    window.addEventListener("keydown", restartGameHandler);
}

// Настройка слушателя для старта
function setupStartListener() {
    if (startGameHandler) {
        window.removeEventListener("keydown", startGameHandler);
    }
    startGameHandler = (e) => {
        if (e.code === "Space" || e.code === "Enter") {
            startGame();
        }
    };
    window.addEventListener("keydown", startGameHandler);
}

// Рестарт игры
function restartGame() {
    lastScore = score;
    
    if (lastScoreElement) {
        lastScoreElement.textContent = lastScore;
    }
    if (mainLastScoreElement) {
        mainLastScoreElement.textContent = lastScore;
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

    deathSound.pause();
    deathSound.currentTime = 0;
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
    
    mainMenuMusic.currentTime = 0;
    mainMenuMusic.play().catch(error => console.error("Ошибка запуска музыки:", error));

    mainScreen.style.display = "flex";
    canvas.style.display = "none";
    gameOverModal.style.display = "none";

    if (restartGameHandler) {
        window.removeEventListener("keydown", restartGameHandler);
        restartGameHandler = null;
    }
    
    setupStartListener();
}

// Старт игры
function startGame() {
    mainScreen.style.display = "none";
    howToPlayModal.style.display = "none";
    gameOverModal.style.display = "none";
    canvas.style.display = "block";

    // Полностью останавливаем музыку главного меню
    mainMenuMusic.pause();
    mainMenuMusic.currentTime = 0;
    
    // Запускаем музыку игры
    backgroundMusic.currentTime = 0;
    backgroundMusic.play().catch(error => console.error("Ошибка запуска игровой музыки:", error));

    gameStartTime = Date.now();
    lastFrameTime = null;
    deathTime = null;
    gameOverShown = false;

    if (startGameHandler) {
        window.removeEventListener("keydown", startGameHandler);
        startGameHandler = null;
    }

    requestAnimationFrame(gameLoop);
}

// Загрузка изображений
let imagesLoaded = 0;
const totalImages = 11;

function imageLoaded() {
    imagesLoaded++;
    if (imagesLoaded === totalImages) {
        if (mainLastScoreElement) {
            mainLastScoreElement.textContent = lastScore;
        }
        setupStartListener();
    }
}

function imageError(imageName) {
    console.error(`Ошибка загрузки изображения: ${imageName}`);
    alert(`Не удалось загрузить изображение: ${imageName}. Проверьте путь к файлу.`);
}

backgroundWithGround.onload = imageLoaded;
backgroundWithGround.onerror = () => imageError("background_with_ground.png");

playerImage.onload = imageLoaded;
playerImage.onerror = () => imageError("siggy.png");

playerImageLeft.onload = imageLoaded;
playerImageLeft.onerror = () => imageError("siggy_left.png");

enemyImage.onload = imageLoaded;
enemyImage.onerror = () => imageError("mob2.png");

enemyDeadImage.onload = imageLoaded;
enemyDeadImage.onerror = () => imageError("mob2_dead.png");

enemyImage2.onload = imageLoaded;
enemyImage2.onerror = () => imageError("mob3.png");

enemyDeadImage2.onload = imageLoaded;
enemyDeadImage2.onerror = () => imageError("mob3_dead.png");

shooterImage.onload = imageLoaded;
shooterImage.onerror = () => imageError("shooter.png");

barrelImage.onload = imageLoaded;
barrelImage.onerror = () => imageError("barrel.gif");

enemyImage3.onload = imageLoaded;
enemyImage3.onerror = () => imageError("images/mob1.png");

enemyDeadImage3.onload = imageLoaded;
enemyDeadImage3.onerror = () => imageError("images/mob1_dead.png");