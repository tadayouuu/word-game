const stage = document.getElementById("stage");
const answerSlots = document.getElementById("answerSlots");
const questionText = document.getElementById("questionText");
const nextButton = document.getElementById("nextButton");
const toast = document.getElementById("toast");
const celebration = document.getElementById("celebration");

const state = {
    words: [],
    currentIndex: 0,
    currentWord: null,
    charObjects: [],
    slotValues: [],
    dragging: null,
    animFrame: null
};

async function loadWords() {
    const res = await fetch("./words.json", { cache: "no-store" });
    if (!res.ok) {
        throw new Error("words.json の読み込みに失敗しました");
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error("words.json に問題データがありません");
    }
    state.words = shuffle([...data]);
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 1800);
}

function normalizeWord(word) {
    return String(word).trim();
}

function createAnswerSlots(word) {
    answerSlots.innerHTML = "";
    const chars = [...word];
    state.slotValues = new Array(chars.length).fill(null);

    chars.forEach((_, index) => {
        const slot = document.createElement("div");
        slot.className = "answer-slot";
        slot.dataset.index = String(index);
        answerSlots.appendChild(slot);
    });
}

function getQuestionLabel(item) {
    if (item.hint) {
        return `${item.hint}：${item.word}`;
    }
    return item.word;
}

function buildQuestion(item) {
    state.currentWord = item;
    questionText.textContent = item.hint ? `${item.hint} は なにかな？` : "ことばを つくろう！";
    createAnswerSlots(item.word);
    buildFloatingChars(item.word);
}

function clearStage() {
    cancelAnimationFrame(state.animFrame);
    stage.innerHTML = "";
    state.charObjects = [];
}

function buildFloatingChars(word) {
    clearStage();

    const chars = shuffle([...word]);
    const stageRect = stage.getBoundingClientRect();
    const charSize = clamp(Math.min(stageRect.width, stageRect.height) * 0.14, 58, 78);

    const positions = generateNonOverlappingPositions(
        chars.length,
        stageRect.width,
        stageRect.height,
        charSize,
        14,
        120
    );

    chars.forEach((char, i) => {
        const el = document.createElement("div");
        el.className = "floating-char";
        el.textContent = char;
        el.dataset.char = char;
        el.dataset.charId = `${char}-${i}-${Date.now()}`;
        el.style.width = `${charSize}px`;
        el.style.height = `${charSize}px`;

        const pos = positions[i] || {
            x: 10 + i * (charSize + 8),
            y: 10
        };

        const obj = {
            id: el.dataset.charId,
            char,
            el,
            x: pos.x,
            y: pos.y,
            vx: randomRange(-0.35, 0.35),
            vy: randomRange(-0.25, 0.25),
            size: charSize,
            used: false
        };

        placeCharElement(obj);
        bindDrag(obj);
        stage.appendChild(el);
        state.charObjects.push(obj);
    });

    startFloating();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * 重なりにくい初期配置
 */
function generateNonOverlappingPositions(count, width, height, size, padding = 12, maxTry = 100) {
    const results = [];
    const minX = padding;
    const minY = padding;
    const maxX = Math.max(minX, width - size - padding);
    const maxY = Math.max(minY, height - size - padding);

    for (let i = 0; i < count; i++) {
        let placed = false;

        for (let t = 0; t < maxTry; t++) {
            const candidate = {
                x: randomRange(minX, maxX),
                y: randomRange(minY, maxY)
            };

            const ok = results.every((p) => {
                const dx = p.x - candidate.x;
                const dy = p.y - candidate.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return dist >= size * 1.15;
            });

            if (ok) {
                results.push(candidate);
                placed = true;
                break;
            }
        }

        if (!placed) {
            results.push({
                x: randomRange(minX, maxX),
                y: randomRange(minY, maxY)
            });
        }
    }

    return results;
}

function placeCharElement(obj) {
    obj.el.style.left = `${obj.x}px`;
    obj.el.style.top = `${obj.y}px`;
}

function startFloating() {
    cancelAnimationFrame(state.animFrame);

    const tick = () => {
        const rect = stage.getBoundingClientRect();

        for (const obj of state.charObjects) {
            if (obj.used) continue;
            if (state.dragging && state.dragging.id === obj.id) continue;

            obj.x += obj.vx;
            obj.y += obj.vy;

            if (obj.x <= 0) {
                obj.x = 0;
                obj.vx *= -1;
            }
            if (obj.y <= 0) {
                obj.y = 0;
                obj.vy *= -1;
            }
            if (obj.x >= rect.width - obj.size) {
                obj.x = rect.width - obj.size;
                obj.vx *= -1;
            }
            if (obj.y >= rect.height - obj.size) {
                obj.y = rect.height - obj.size;
                obj.vy *= -1;
            }

            placeCharElement(obj);
        }

        state.animFrame = requestAnimationFrame(tick);
    };

    state.animFrame = requestAnimationFrame(tick);
}

function bindDrag(obj) {
    const el = obj.el;

    el.addEventListener("pointerdown", (e) => {
        if (obj.used) return;

        e.preventDefault();
        el.setPointerCapture(e.pointerId);

        const elRect = el.getBoundingClientRect();

        state.dragging = {
            id: obj.id,
            obj,
            pointerId: e.pointerId,
            offsetX: e.clientX - elRect.left,
            offsetY: e.clientY - elRect.top,
            fromStage: {
                x: obj.x,
                y: obj.y
            }
        };

        el.classList.add("dragging");

        // ドラッグ中は画面基準で動かす
        el.style.position = "fixed";
        el.style.left = `${elRect.left}px`;
        el.style.top = `${elRect.top}px`;
        el.style.zIndex = "9999";
    });

    el.addEventListener("pointermove", (e) => {
        if (!state.dragging) return;
        if (state.dragging.id !== obj.id) return;
        if (state.dragging.pointerId !== e.pointerId) return;

        const newLeft = e.clientX - state.dragging.offsetX;
        const newTop = e.clientY - state.dragging.offsetY;

        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;

        updateSlotHover(e.clientX, e.clientY);
    });

    const finishDrag = (e) => {
        if (!state.dragging) return;
        if (state.dragging.id !== obj.id) return;
        if (state.dragging.pointerId !== e.pointerId) return;

        const slot = findSlotAtPoint(e.clientX, e.clientY);
        clearSlotHover();

        if (slot) {
            const slotIndex = Number(slot.dataset.index);
            tryPutCharToSlot(obj, slotIndex);
        }

        el.classList.remove("dragging");

        if (!obj.used) {
            // ステージ内に戻す
            el.style.position = "absolute";
            el.style.zIndex = "";
            obj.x = state.dragging.fromStage.x;
            obj.y = state.dragging.fromStage.y;
            placeCharElement(obj);
        } else {
            // 使用済みなら見えなくてOK
            el.style.position = "absolute";
            el.style.zIndex = "";
            placeCharElement(obj);
        }

        state.dragging = null;
    };

    el.addEventListener("pointerup", finishDrag);
    el.addEventListener("pointercancel", finishDrag);
}

function findSlotAtPoint(clientX, clientY) {
    const slots = [...document.querySelectorAll(".answer-slot")];
    return slots.find((slot) => {
        const r = slot.getBoundingClientRect();
        return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    }) || null;
}

function updateSlotHover(clientX, clientY) {
    const slots = [...document.querySelectorAll(".answer-slot")];
    slots.forEach((slot) => slot.classList.remove("over"));

    const slot = findSlotAtPoint(clientX, clientY);
    if (slot) slot.classList.add("over");
}

function clearSlotHover() {
    [...document.querySelectorAll(".answer-slot")].forEach((slot) => slot.classList.remove("over"));
}

function tryPutCharToSlot(obj, slotIndex) {
    if (state.slotValues[slotIndex]) {
        showToast("ここには もう はいっとるよ");
        return;
    }

    state.slotValues[slotIndex] = {
        char: obj.char,
        charId: obj.id
    };

    obj.used = true;
    obj.el.classList.add("used");

    renderAnswerSlots();
    checkAnswer();
}

function renderAnswerSlots() {
    const slots = [...document.querySelectorAll(".answer-slot")];

    slots.forEach((slot, index) => {
        slot.innerHTML = "";
        slot.classList.remove("filled");

        const value = state.slotValues[index];
        if (!value) return;

        slot.classList.add("filled");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "answer-chip";
        btn.textContent = value.char;
        btn.setAttribute("aria-label", `${value.char} を もどす`);

        btn.addEventListener("click", () => {
            returnCharFromSlot(index);
        });

        slot.appendChild(btn);
    });
}

function returnCharFromSlot(slotIndex) {
    const value = state.slotValues[slotIndex];
    if (!value) return;

    const obj = state.charObjects.find((c) => c.id === value.charId);
    if (obj) {
        obj.used = false;
        obj.el.classList.remove("used");
    }

    state.slotValues[slotIndex] = null;
    renderAnswerSlots();
}

function checkAnswer() {
    const allFilled = state.slotValues.every(Boolean);
    if (!allFilled) return;

    const answer = state.slotValues.map((v) => v.char).join("");
    const correct = normalizeWord(state.currentWord.word);

    if (answer === correct) {
        playCorrectEffect();
    } else {
        showToast("ちがうみたい。もういっかい！");
    }
}

function playCorrectEffect() {
    const answerCard = document.querySelector(".answer-card");
    answerCard.classList.add("correct");
    setTimeout(() => answerCard.classList.remove("correct"), 500);

    spawnCelebration();
    showToast("せいかい！ すごい！");
}

function spawnCelebration() {
    const items = ["🎉", "✨", "🌸", "💮", "⭐"];
    celebration.innerHTML = "";

    for (let i = 0; i < 14; i++) {
        const item = document.createElement("div");
        item.className = "celebration-item";
        item.textContent = items[Math.floor(Math.random() * items.length)];
        item.style.left = `${Math.random() * 100}%`;
        item.style.animationDelay = `${Math.random() * 0.18}s`;
        item.style.animationDuration = `${900 + Math.random() * 600}ms`;
        celebration.appendChild(item);
    }

    setTimeout(() => {
        celebration.innerHTML = "";
    }, 1800);
}

function nextQuestion() {
    if (state.words.length === 0) return;

    state.currentIndex += 1;
    if (state.currentIndex >= state.words.length) {
        state.words = shuffle([...state.words]);
        state.currentIndex = 0;
    }

    buildQuestion(state.words[state.currentIndex]);
}

function rebuildCurrentQuestion() {
    if (!state.words.length) return;
    buildQuestion(state.words[state.currentIndex]);
}

function onResize() {
    rebuildCurrentQuestion();
}

nextButton.addEventListener("click", () => {
    nextQuestion();
});

window.addEventListener("resize", debounce(onResize, 180));

function debounce(fn, wait = 100) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

async function init() {
    try {
        await loadWords();
        state.currentIndex = 0;
        buildQuestion(state.words[state.currentIndex]);
    } catch (err) {
        console.error(err);
        questionText.textContent = "よみこみに しっぱい したよ";
        showToast("words.json を かくにんしてね");
    }
}

init();