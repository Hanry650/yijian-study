// 一建复习工具 - 核心逻辑

// ==================== Supabase 配置 ====================
// Supabase 项目配置
const SUPABASE_URL = 'https://ugajratioesiisytbcqh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UycJ1sLeEwPa5iWREI7Aag_CTJMZyB_';
let supabase = null;
let currentUser = null;

// 初始化 Supabase（如果配置有效）
function initSupabase() {
    if (!SUPABASE_URL || SUPABASE_URL.includes('your-project')) {
        console.log('Supabase 未配置，使用本地存储模式');
        return false;
    }
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return true;
    } catch (e) {
        console.error('Supabase 初始化失败', e);
        return false;
    }
}

// ==================== 云端同步功能 ====================
async function cloudLogin() {
    if (!supabase) { alert('云端服务未配置'); return; }
    const email = document.getElementById('cloud-email').value.trim();
    const password = document.getElementById('cloud-password').value;
    if (!email || !password) { alert('请输入邮箱和密码'); return; }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert('登录失败：' + error.message);
    } else {
        currentUser = data.user;
        updateCloudUI();
        alert('登录成功！');
    }
}

async function cloudRegister() {
    if (!supabase) { alert('云端服务未配置'); return; }
    const email = document.getElementById('cloud-email').value.trim();
    const password = document.getElementById('cloud-password').value;
    if (!email || !password) { alert('请输入邮箱和密码'); return; }
    if (password.length < 6) { alert('密码至少6位'); return; }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
        console.error('注册错误详情：', error);
        if (error.code === 'over_email_send_rate_limit') {
            // 邮件频率限制，但用户可能已创建，尝试直接登录
            alert('邮件发送频率受限，尝试直接登录...');
            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
            if (loginError) {
                alert('登录失败：' + loginError.message + '\n\n请等待约1小时后重试，或换一个邮箱注册。');
            } else {
                currentUser = loginData.user;
                updateCloudUI();
                alert('登录成功！（该账号已存在）');
            }
        } else if (error.message.includes('User already registered')) {
            // 用户已存在，直接登录
            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
            if (loginError) {
                alert('该邮箱已注册，但密码错误。');
            } else {
                currentUser = loginData.user;
                updateCloudUI();
                alert('登录成功！');
            }
        } else {
            alert('注册失败：' + error.message);
        }
    } else {
        currentUser = data.user;
        updateCloudUI();
        if (data.session) {
            alert('注册成功！已自动登录');
        } else {
            alert('注册成功！请查收验证邮件后登录');
        }
    }
}

async function cloudLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    currentUser = null;
    updateCloudUI();
}

async function cloudUpload() {
    if (!supabase || !currentUser) { alert('请先登录'); return; }

    const data = {
        questions: questions,
        wrongCounts: wrongCounts,
        updatedAt: new Date().toISOString()
    };

    const { error } = await supabase
        .from('user_data')
        .upsert({ user_id: currentUser.id, data: data }, { onConflict: 'user_id' });

    if (error) {
        alert('上传失败：' + error.message);
    } else {
        localStorage.setItem('lastCloudSync', data.updatedAt);
        updateCloudUI();
        updateCloudUploadButtons();
        alert('上传成功！数据已保存到云端');
    }
}

// 更新所有上传云端按钮的显示状态
function updateCloudUploadButtons() {
    const configBtn = document.getElementById('config-cloud-upload-btn');
    const resultBtn = document.getElementById('result-cloud-upload-btn');

    if (currentUser && questions.length > 0) {
        configBtn.classList.remove('hidden');
        resultBtn.classList.remove('hidden');
    } else {
        configBtn.classList.add('hidden');
        resultBtn.classList.add('hidden');
    }
}

async function cloudDownload() {
    if (!supabase || !currentUser) { alert('请先登录'); return; }

    const { data, error } = await supabase
        .from('user_data')
        .select('data')
        .eq('user_id', currentUser.id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            alert('云端没有数据，请先上传');
        } else {
            alert('下载失败：' + error.message);
        }
        return;
    }

    if (!data || !data.data) {
        alert('云端数据为空');
        return;
    }

    const cloudData = data.data;
    const existingCount = questions.length;
    const cloudCount = cloudData.questions ? cloudData.questions.length : 0;

    if (existingCount === 0) {
        // 本地无数据，直接覆盖
        applyCloudData(cloudData);
    } else {
        // 询问覆盖还是合并
        if (confirm(`本地有 ${existingCount} 题，云端有 ${cloudCount} 题。\n点击「确定」覆盖本地，「取消」合并数据。`)) {
            applyCloudData(cloudData);
        } else {
            mergeCloudData(cloudData);
        }
    }
}

function applyCloudData(cloudData) {
    questions = cloudData.questions || [];
    wrongCounts = cloudData.wrongCounts || {};

    chapters = new Set();
    questions.forEach(q => { if (q.chapter) chapters.add(q.chapter); });
    wrongQuestions = new Set(Object.keys(wrongCounts).map(Number));

    localStorage.setItem('questions', JSON.stringify(questions));
    localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));
    localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));
    localStorage.setItem('lastCloudSync', cloudData.updatedAt || new Date().toISOString());

    updateCloudUI();
    if (questions.length > 0) {
        document.getElementById('home-actions').style.display = 'block';
    }
    alert(`同步完成！共 ${questions.length} 题，${wrongQuestions.size} 道错题`);
}

function mergeCloudData(cloudData) {
    const cloudQuestions = cloudData.questions || [];
    const cloudWrongCounts = cloudData.wrongCounts || {};

    // 合并题库（云端题目优先）
    const existingIds = new Set(questions.map(q => q.id));
    cloudQuestions.forEach(q => {
        if (!existingIds.has(q.id)) {
            questions.push(q);
        }
    });

    // 合并错题记录（取最大值）
    Object.entries(cloudWrongCounts).forEach(([id, count]) => {
        const numId = parseInt(id, 10);
        wrongCounts[numId] = Math.max(wrongCounts[numId] || 0, count);
    });

    chapters = new Set();
    questions.forEach(q => { if (q.chapter) chapters.add(q.chapter); });
    wrongQuestions = new Set(Object.keys(wrongCounts).map(Number));

    localStorage.setItem('questions', JSON.stringify(questions));
    localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));
    localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));
    localStorage.setItem('lastCloudSync', cloudData.updatedAt || new Date().toISOString());

    updateCloudUI();
    if (questions.length > 0) {
        document.getElementById('home-actions').style.display = 'block';
    }
    alert(`合并完成！共 ${questions.length} 题，${wrongQuestions.size} 道错题`);
}

function updateCloudUI() {
    const loginForm = document.getElementById('cloud-login-form');
    const userArea = document.getElementById('cloud-user-area');
    const userEmail = document.getElementById('cloud-user-email');
    const lastSync = document.getElementById('cloud-last-sync');

    if (currentUser) {
        loginForm.classList.add('hidden');
        userArea.classList.remove('hidden');
        userEmail.textContent = `已登录：${currentUser.email}`;

        const syncTime = localStorage.getItem('lastCloudSync');
        if (syncTime) {
            const date = new Date(syncTime);
            lastSync.textContent = `上次同步：${date.toLocaleString()}`;
        } else {
            lastSync.textContent = '尚未同步';
        }
    } else {
        loginForm.classList.remove('hidden');
        userArea.classList.add('hidden');
        userEmail.textContent = '';
        lastSync.textContent = '';
    }

    updateCloudUploadButtons();
}

// 绑定云端按钮事件
document.getElementById('cloud-login-btn').addEventListener('click', cloudLogin);
document.getElementById('cloud-register-btn').addEventListener('click', cloudRegister);
document.getElementById('cloud-logout-btn').addEventListener('click', cloudLogout);
document.getElementById('cloud-upload-btn').addEventListener('click', cloudUpload);
document.getElementById('cloud-download-btn').addEventListener('click', cloudDownload);
document.getElementById('config-cloud-upload-btn').addEventListener('click', cloudUpload);
document.getElementById('result-cloud-upload-btn').addEventListener('click', cloudUpload);

// ==================== 数据存储 ====================
let questions = [];           // 全部题目
let chapters = new Set();      // 章节集合
let wrongCounts = JSON.parse(localStorage.getItem('wrongCounts') || '{}');  // 错题ID -> 错误次数
let wrongQuestions = new Set(Object.keys(wrongCounts).map(Number));  // 错题ID集合（兼容旧数据）
let currentQuestions = [];     // 当前轮次的题目列表
let currentIndex = 0;          // 当前题目索引
let stats = {                 // 本轮统计
    total: 0,
    correct: 0,
    wrong: 0,
    skip: 0,
    wrongList: []
};

// ==================== DOM 元素 ====================
const screens = {
    upload: document.getElementById('upload-screen'),
    config: document.getElementById('config-screen'),
    quiz: document.getElementById('quiz-screen'),
    result: document.getElementById('result-screen'),
    wrongBank: document.getElementById('wrong-bank-screen'),
    study: document.getElementById('study-screen')
};

// ==================== 界面切换 ====================
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// ==================== Excel 解析 ====================
document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('file-name').textContent = `已选择: ${file.name}`;

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        parseQuestions(jsonData);
        showConfigScreen();
    } catch (err) {
        alert('解析Excel失败: ' + err.message);
    }
});

// 提取章节编号前缀（如 "1.1.1 建设工程" → "1.1.1"）
function extractChapterPrefix(chapterName) {
    if (!chapterName) return '';
    // 匹配开头数字.数字.数字... 的模式
    const match = chapterName.match(/^(\d+(?:\.\d+)*)/);
    return match ? match[1] : chapterName;
}

// 数字版本比较（支持 1.1.10 > 1.1.2）
function compareVersion(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA !== numB) return numA - numB;
    }
    return 0;
}

function parseQuestions(data) {
    questions = [];
    chapters = new Set();
    const chapterPrefixMap = new Map(); // 编号前缀 -> 显示名称

    // 跳过表头，从第二行开始
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 2) continue;

        const rawChapter = String(row[0] || '').trim();
        const question = String(row[1] || '').trim();
        const answer = String(row[2] || '').trim();

        if (!question || !answer) continue;

        // 提取编号前缀并统一章节名
        const prefix = extractChapterPrefix(rawChapter);
        const normalizedChapter = prefix || rawChapter || '未分类';

        // 记录编号到显示名的映射（取最长的作为显示名）
        if (prefix && (!chapterPrefixMap.has(prefix) || rawChapter.length > chapterPrefixMap.get(prefix).length)) {
            chapterPrefixMap.set(prefix, rawChapter);
        }

        if (normalizedChapter) chapters.add(normalizedChapter);

        questions.push({
            id: i,
            chapter: normalizedChapter,
            question: question,
            answer: answer
        });
    }

    // 按章节排序（使用数字版本比较，确保 1.1.6 < 1.1.10）
    questions.sort((a, b) => {
        // 先按章节编号排序
        if (a.chapter !== b.chapter) {
            return compareVersion(a.chapter, b.chapter);
        }
        // 同一章节内按id排序（即Excel中的行顺序）
        return a.id - b.id;
    });

    // 保存到 localStorage
    localStorage.setItem('questions', JSON.stringify(questions));
    localStorage.setItem('chapterPrefixMap', JSON.stringify([...chapterPrefixMap]));
}

// 章节排序方向（true=正序，false=倒序）
let chapterSortAsc = true;

// ==================== 配置界面 ====================
function showConfigScreen() {
    renderChapterList();

    // 显示统计
    const wrongCount = questions.filter(q => wrongQuestions.has(q.id)).length;
    document.getElementById('stats-info').innerHTML = `
        题库共 <strong>${questions.length}</strong> 题，
        已标记错题 <strong>${wrongCount}</strong> 题
    `;

    // 更新上传云端按钮显示
    updateCloudUploadButtons();

    showScreen('config');
}

function renderChapterList() {
    const container = document.getElementById('chapter-checkboxes');
    const allCount = questions.length;

    // 保留"全部章节"选项，重建章节列表
    container.innerHTML = `
        <label data-value="all" class="chapter-label">
            <input type="checkbox" value="all" checked>
            <span class="chapter-name">全部章节</span>
            <span class="chapter-count">${allCount}题</span>
        </label>
    `;

    // 获取编号到显示名的映射
    let chapterPrefixMap = new Map();
    try {
        const stored = localStorage.getItem('chapterPrefixMap');
        if (stored) chapterPrefixMap = new Map(JSON.parse(stored));
    } catch (e) {}

    // 将章节按编号排序（使用数字版本比较）
    let sortedChapters = Array.from(chapters).sort((a, b) => compareVersion(a, b));
    if (!chapterSortAsc) {
        sortedChapters.reverse();
    }

    sortedChapters.forEach(ch => {
        const count = questions.filter(q => q.chapter === ch).length;
        // 使用原始显示名（如果有的话）
        const displayName = chapterPrefixMap.get(ch) || ch;
        const label = document.createElement('label');
        label.dataset.value = ch;
        label.className = 'chapter-label';
        label.innerHTML = `<input type="checkbox" value="${escapeHtml(ch)}"> <span class="chapter-name">${escapeHtml(displayName)}</span> <span class="chapter-count">${count}题</span>`;
        container.appendChild(label);
    });

    // 绑定章节多选事件
    bindChapterCheckboxEvents();

    // 更新排序按钮文字
    const sortBtn = document.getElementById('chapter-sort-btn');
    if (sortBtn) {
        sortBtn.textContent = chapterSortAsc ? '🔃 倒序' : '🔃 正序';
    }
}

// 章节排序按钮事件
document.getElementById('chapter-sort-btn').addEventListener('click', () => {
    chapterSortAsc = !chapterSortAsc;
    renderChapterList();
});

function bindChapterCheckboxEvents() {
    const container = document.getElementById('chapter-checkboxes');
    const allCheckbox = container.querySelector('input[value="all"]');
    const chapterCheckboxes = container.querySelectorAll('input[type="checkbox"]:not([value="all"])');

    // "全部"选中时，取消所有单独章节
    allCheckbox.addEventListener('change', () => {
        if (allCheckbox.checked) {
            chapterCheckboxes.forEach(cb => {
                cb.checked = false;
                cb.closest('label').classList.remove('checked');
            });
        }
        updateChapterSelectedCount();
    });

    // 单独章节选中时，取消"全部"
    chapterCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                allCheckbox.checked = false;
                allCheckbox.closest('label').classList.remove('checked');
            }
            // 如果没有选中任何章节，自动选中"全部"
            const anyChecked = Array.from(chapterCheckboxes).some(c => c.checked);
            if (!anyChecked) {
                allCheckbox.checked = true;
            }
            updateChapterSelectedCount();
        });
    });

    updateChapterSelectedCount();
}

function updateChapterSelectedCount() {
    const selected = getSelectedChapters();
    const countEl = document.getElementById('chapter-selected-count');
    if (selected.length === 0 || (selected.length === 1 && selected[0] === 'all')) {
        countEl.textContent = '（全部章节）';
    } else {
        const total = questions.filter(q => selected.includes(q.chapter)).length;
        countEl.textContent = `（已选 ${selected.length} 个章节，共 ${total} 题）`;
    }
}

function getSelectedChapters() {
    const container = document.getElementById('chapter-checkboxes');
    const allCheckbox = container.querySelector('input[value="all"]');
    if (allCheckbox.checked) return ['all'];

    const checked = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
}

// ==================== 自定义题数输入框显示/隐藏 ====================
document.querySelectorAll('input[name="count"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const customInput = document.getElementById('custom-count');
        if (e.target.value === 'custom') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    });
});

// ==================== 开始复习 ====================
document.getElementById('start-btn').addEventListener('click', startQuiz);

// ==================== 学习模式 ====================
document.getElementById('study-btn').addEventListener('click', startStudy);
document.getElementById('home-study-btn').addEventListener('click', () => {
    showConfigScreen();
    // 高亮学习模式按钮
    setTimeout(() => document.getElementById('study-btn').focus(), 100);
});

let studyQuestions = [];
let studyIndex = 0;

function startStudy() {
    const selectedChapters = getSelectedChapters();
    const order = document.querySelector('input[name="order"]:checked').value;
    const countType = document.querySelector('input[name="count"]:checked').value;

    let targetCount;
    if (countType === 'all') {
        targetCount = Infinity;
    } else if (countType === 'custom') {
        const customVal = parseInt(document.getElementById('custom-count').value, 10);
        if (!customVal || customVal < 1) {
            alert('请输入有效的题数');
            return;
        }
        targetCount = customVal;
    } else {
        targetCount = parseInt(countType, 10);
    }

    // 筛选题目
    let filtered = questions;

    if (!selectedChapters.includes('all')) {
        filtered = filtered.filter(q => selectedChapters.includes(q.chapter));
    }

    if (filtered.length === 0) {
        alert('没有符合条件的题目');
        return;
    }

    // 排序
    if (order === 'random') {
        filtered = shuffleArray([...filtered]);
    }

    // 截断到目标数量
    if (targetCount !== Infinity) {
        filtered = filtered.slice(0, targetCount);
    }

    studyQuestions = filtered;
    studyIndex = 0;

    showScreen('study');
    showStudyQuestion();
}

function showStudyQuestion() {
    const q = studyQuestions[studyIndex];

    // 更新进度
    const progress = ((studyIndex) / studyQuestions.length) * 100;
    document.getElementById('study-progress-fill').style.width = progress + '%';
    document.getElementById('study-progress-text').textContent =
        `${studyIndex + 1} / ${studyQuestions.length}`;

    // 显示章节
    document.getElementById('study-chapter-tag').textContent = q.chapter;

    // 解析空白并渲染题目（答案已填入）
    const parsed = parseBlanks(q.question, q.answer);

    const questionTextDiv = document.getElementById('study-question-text');
    questionTextDiv.innerHTML = '';

    if (parsed.hasBlanks) {
        // 填空题：将答案填入空白处展示
        parsed.segments.forEach((segment, index) => {
            if (segment) {
                const textSpan = document.createElement('span');
                textSpan.textContent = segment;
                questionTextDiv.appendChild(textSpan);
            }

            if (index < parsed.blankCount) {
                const answerSpan = document.createElement('span');
                answerSpan.className = 'study-blank-filled';
                answerSpan.textContent = parsed.answerParts[index] || '?';
                questionTextDiv.appendChild(answerSpan);
            }
        });
    } else {
        // 非填空题：只显示题目
        questionTextDiv.textContent = q.question;
    }

    // 显示完整答案
    document.getElementById('study-answer-text').textContent = parsed.fullAnswer;

    // 更新按钮状态
    document.getElementById('study-prev-btn').disabled = studyIndex === 0;
    document.getElementById('study-prev-btn').style.opacity = studyIndex === 0 ? '0.5' : '1';
}

// 学习模式按钮事件
document.getElementById('study-next-btn').addEventListener('click', () => {
    studyIndex++;
    if (studyIndex >= studyQuestions.length) {
        showStudyCompleteDialog();
    } else {
        showStudyQuestion();
    }
});

// ==================== 学习模式完成弹窗 ====================
function showStudyCompleteDialog() {
    // 获取未选中的题目
    const selectedChapters = getSelectedChapters();
    const allQuestions = questions;
    let unselectedQuestions = [];

    if (!selectedChapters.includes('all')) {
        unselectedQuestions = allQuestions.filter(q => !selectedChapters.includes(q.chapter));
    }

    // 创建弹窗
    const modal = document.createElement('div');
    modal.id = 'study-complete-modal';
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';

    let contentHtml = `
        <div style="background:#fff;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);text-align:center;">
            <div style="font-size:48px;margin-bottom:15px;">🎉</div>
            <h3 style="margin-bottom:10px;color:#2d3748;">学习完成！</h3>
            <p style="margin-bottom:25px;color:#4a5568;">已完成当前选择的 ${studyQuestions.length} 道题目</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="study-complete-home" class="primary-btn" style="width:100%;">🏠 返回首页</button>
    `;

    if (unselectedQuestions.length > 0) {
        contentHtml += `<button id="study-complete-continue" class="secondary-btn" style="width:100%;">📚 继续学习其他 ${unselectedQuestions.length} 道未选中题目</button>`;
    }

    contentHtml += `
            </div>
        </div>
    `;

    modal.innerHTML = contentHtml;
    document.body.appendChild(modal);

    // 返回首页
    document.getElementById('study-complete-home').addEventListener('click', () => {
        document.body.removeChild(modal);
        showConfigScreen();
    });

    // 继续学习未选中题目
    const continueBtn = document.getElementById('study-complete-continue');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            // 切换到全部章节，开始学习
            document.querySelector('input[value="all"]').checked = true;
            renderChapterList();
            startStudy();
        });
    }
}

document.getElementById('study-prev-btn').addEventListener('click', () => {
    if (studyIndex > 0) {
        studyIndex--;
        showStudyQuestion();
    }
});

document.getElementById('study-end-btn').addEventListener('click', () => {
    if (confirm('确定要结束学习吗？')) {
        showConfigScreen();
    }
});

function startQuiz() {
    const selectedChapters = getSelectedChapters();
    const order = document.querySelector('input[name="order"]:checked').value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const countType = document.querySelector('input[name="count"]:checked').value;

    let targetCount;
    if (countType === 'all') {
        targetCount = Infinity;
    } else if (countType === 'custom') {
        const customVal = parseInt(document.getElementById('custom-count').value, 10);
        if (!customVal || customVal < 1) {
            alert('请输入有效的题数');
            return;
        }
        targetCount = customVal;
    } else {
        targetCount = parseInt(countType, 10);
    }

    // 筛选题目
    let filtered = questions;

    if (!selectedChapters.includes('all')) {
        filtered = filtered.filter(q => selectedChapters.includes(q.chapter));
    }

    if (type === 'wrong') {
        filtered = filtered.filter(q => wrongQuestions.has(q.id));
    }

    if (filtered.length === 0) {
        alert('没有符合条件的题目');
        return;
    }

    // 排序
    if (order === 'random') {
        filtered = shuffleArray([...filtered]);
    }

    // 如果目标题数大于可用题数，循环补充
    let finalQuestions = [...filtered];
    while (targetCount !== Infinity && finalQuestions.length < targetCount) {
        if (order === 'random') {
            finalQuestions = finalQuestions.concat(shuffleArray([...filtered]));
        } else {
            finalQuestions = finalQuestions.concat([...filtered]);
        }
    }
    // 截断到目标数量（"全部"时不截断）
    if (targetCount !== Infinity) {
        finalQuestions = finalQuestions.slice(0, targetCount);
    }

    currentQuestions = finalQuestions;
    currentIndex = 0;
    stats = { total: finalQuestions.length, correct: 0, wrong: 0, skip: 0, wrongList: [] };

    showScreen('quiz');
    showQuestion();
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ==================== 填空题解析 ====================
function parseBlanks(questionText, answerText) {
    // 支持中文括号（）和英文括号 ()，允许中间有空格如（ ）
    const blankRegex = /（\s*）|\(\s*\)/g;
    const blanks = [...questionText.matchAll(blankRegex)];
    const blankCount = blanks.length;

    const stripPrefix = (str) => str.replace(/^答案[：:]\s*/, '').replace(/^答[：:]\s*/, '').trim();
    const cleanAnswer = stripPrefix(answerText);

    if (blankCount === 0) {
        return { hasBlanks: false, blankCount: 0, segments: [], answerParts: [], fullAnswer: cleanAnswer };
    }

    // 将题目按空白拆分为 segments（支持中文和英文括号，允许中间有空格）
    const segments = questionText.split(/（\s*）|\(\s*\)/);

    // 将答案拆分为对应空白的部分
    const answerParts = splitAnswerByDelimiter(cleanAnswer, blankCount);

    return {
        hasBlanks: true,
        blankCount,
        segments,
        answerParts,
        fullAnswer: cleanAnswer
    };
}

function splitAnswerByDelimiter(answer, blankCount) {
    if (blankCount === 1) {
        return [answer];
    }

    // 优先按 、 拆分
    let parts = answer.split(/[、,]/).map(s => s.trim()).filter(s => s);
    if (parts.length === blankCount) return parts;

    // 再尝试按 和 拆分
    parts = answer.split(/\s*和\s*/).map(s => s.trim()).filter(s => s);
    if (parts.length === blankCount) return parts;

    // 回退：每个空白都填入完整答案
    return Array(blankCount).fill(answer);
}

// ==================== 显示题目 ====================
function showQuestion() {
    const q = currentQuestions[currentIndex];

    // 解析空白
    const parsed = parseBlanks(q.question, q.answer);
    q._parsed = parsed;

    // 更新进度
    const progress = ((currentIndex) / currentQuestions.length) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent =
        `${currentIndex + 1} / ${currentQuestions.length}`;

    // 显示章节
    document.getElementById('chapter-tag').textContent = q.chapter;

    // 隐藏结果
    const resultArea = document.getElementById('result-area');
    resultArea.classList.add('hidden');
    resultArea.className = 'hidden';

    // 按钮状态
    document.getElementById('submit-btn').classList.remove('hidden');
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('retry-btn').classList.add('hidden');
    document.getElementById('show-answer-btn').classList.remove('hidden');

    if (parsed.hasBlanks) {
        // 填空模式
        renderBlankQuestion(parsed);
        document.getElementById('free-text-area').classList.add('hidden');
    } else {
        // 自由文本模式
        document.getElementById('question-text').textContent = q.question;
        document.getElementById('free-text-area').classList.remove('hidden');

        const textarea = document.getElementById('user-answer');
        textarea.value = '';
        textarea.disabled = false;
        textarea.focus();
    }
}

function renderBlankQuestion(parsed) {
    const questionTextDiv = document.getElementById('question-text');
    questionTextDiv.innerHTML = '';

    // 构建 inline HTML: segment + input + segment + input + ...
    parsed.segments.forEach((segment, index) => {
        // 添加文本 segment
        if (segment) {
            const textSpan = document.createElement('span');
            textSpan.textContent = segment;
            questionTextDiv.appendChild(textSpan);
        }

        // 添加输入框（最后一个 segment 后面不加）
        if (index < parsed.blankCount) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'blank-input';
            input.dataset.blankIndex = index;
            input.autocomplete = 'off';
            input.inputMode = 'text';

            // 自动聚焦第一个输入框
            if (index === 0) {
                setTimeout(() => input.focus(), 0);
            }

            // Enter 跳到下一个或提交
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextInput = document.querySelector(`[data-blank-index="${index + 1}"]`);
                    if (nextInput) {
                        nextInput.focus();
                    } else {
                        checkAnswer();
                    }
                }
            });

            questionTextDiv.appendChild(input);
        }
    });
}

// ==================== 提交答案 ====================
document.getElementById('submit-btn').addEventListener('click', checkAnswer);
document.getElementById('user-answer').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        checkAnswer();
    }
});

function checkAnswer() {
    const q = currentQuestions[currentIndex];

    if (q._parsed && q._parsed.hasBlanks) {
        checkBlankAnswers(q);
    } else {
        checkFreeTextAnswer(q);
    }
}

function checkBlankAnswers(q) {
    const inputs = document.querySelectorAll('.blank-input');
    const userAnswers = [];
    inputs.forEach(input => {
        userAnswers.push(input.value.trim());
    });

    // 验证所有空白已填写
    if (userAnswers.some(a => !a)) {
        alert('请填写所有空格');
        return;
    }

    // 判断是否需要跨空顺序无关匹配（答案被顿号拆分成多部分，且每部分可填入任意空）
    const answerParts = q._parsed.answerParts;
    const blankCount = q._parsed.blankCount;
    const useCrossBlankMatching = answerParts.length === blankCount && blankCount > 1;

    let results = [];
    let allCorrect = true;

    if (useCrossBlankMatching) {
        // 跨空顺序无关匹配：每个答案可以填入任意一个空
        const matched = new Set();
        results = userAnswers.map((userPart, index) => {
            // 找是否有未匹配的正确答案与用户输入匹配
            let isCorrect = false;
            for (let i = 0; i < answerParts.length; i++) {
                if (!matched.has(i) && compareBlankAnswer(userPart, answerParts[i])) {
                    matched.add(i);
                    isCorrect = true;
                    break;
                }
            }
            if (!isCorrect) allCorrect = false;
            return { user: userPart, expected: answerParts[index], isCorrect };
        });
    } else {
        // 逐空比对（原有逻辑）
        answerParts.forEach((expectedPart, index) => {
            const userPart = userAnswers[index];
            const isCorrect = compareBlankAnswer(userPart, expectedPart);
            results.push({ user: userPart, expected: expectedPart, isCorrect });
            if (!isCorrect) allCorrect = false;
        });
    }

    // 显示逐空反馈
    showBlankFeedback(results);

    // 显示结果区域
    const resultArea = document.getElementById('result-area');
    resultArea.classList.remove('hidden');
    document.getElementById('correct-text').textContent = q._parsed.fullAnswer;

    if (allCorrect) {
        resultArea.className = 'correct';
        document.getElementById('result-icon').textContent = '✓';
        document.getElementById('result-text').textContent = '回答正确！';
        document.querySelector('.result-header').className = 'result-header correct';

        stats.correct++;
        wrongQuestions.delete(q.id);

        delete wrongCounts[q.id];

        localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));

        localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));

        document.getElementById('submit-btn').classList.add('hidden');
        document.getElementById('next-btn').classList.remove('hidden');
        document.getElementById('retry-btn').classList.add('hidden');
        document.getElementById('show-answer-btn').classList.add('hidden');
        document.getElementById('next-btn').focus();
    } else {
        resultArea.className = 'wrong';
        document.getElementById('result-icon').textContent = '✗';
        document.getElementById('result-text').textContent = '回答错误';
        document.querySelector('.result-header').className = 'result-header wrong';

        stats.wrong++;
        wrongQuestions.add(q.id);
        stats.wrongList.push({
            question: q.question,
            userAnswer: userAnswers.join(' / '),
            correctAnswer: q._parsed.fullAnswer
        });
        localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));

        document.getElementById('submit-btn').classList.add('hidden');
        document.getElementById('next-btn').classList.remove('hidden');
        document.getElementById('retry-btn').classList.remove('hidden');
        document.getElementById('show-answer-btn').classList.add('hidden');
        document.getElementById('retry-btn').focus();
    }
}

function checkFreeTextAnswer(q) {
    const userAnswer = document.getElementById('user-answer').value.trim();

    if (!userAnswer) {
        alert('请先输入答案');
        return;
    }

    const isCorrect = compareAnswer(userAnswer, q.answer);

    // 显示结果
    const resultArea = document.getElementById('result-area');
    resultArea.classList.remove('hidden');

    if (isCorrect) {
        resultArea.className = 'correct';
        document.getElementById('result-icon').textContent = '✓';
        document.getElementById('result-text').textContent = '回答正确！';
        document.querySelector('.result-header').className = 'result-header correct';

        stats.correct++;
        wrongQuestions.delete(q.id);

        document.getElementById('correct-text').textContent = q.answer;
        localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));

        document.getElementById('submit-btn').classList.add('hidden');
        document.getElementById('next-btn').classList.remove('hidden');
        document.getElementById('retry-btn').classList.add('hidden');
        document.getElementById('show-answer-btn').classList.add('hidden');
        document.getElementById('user-answer').disabled = true;
        document.getElementById('next-btn').focus();
    } else {
        resultArea.className = 'wrong';
        document.getElementById('result-icon').textContent = '✗';
        document.getElementById('result-text').textContent = '回答错误';
        document.querySelector('.result-header').className = 'result-header wrong';

        stats.wrong++;
        wrongQuestions.add(q.id);
        stats.wrongList.push({
            question: q.question,
            userAnswer: userAnswer,
            correctAnswer: q.answer
        });

        document.getElementById('correct-text').textContent = q.answer;
        localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));

        document.getElementById('submit-btn').classList.add('hidden');
        document.getElementById('next-btn').classList.remove('hidden');
        document.getElementById('retry-btn').classList.remove('hidden');
        document.getElementById('show-answer-btn').classList.add('hidden');
        document.getElementById('user-answer').disabled = true;
        document.getElementById('retry-btn').focus();
    }
}

// ==================== 逐空反馈 ====================
function showBlankFeedback(results) {
    const inputs = document.querySelectorAll('.blank-input');
    inputs.forEach((input, index) => {
        const result = results[index];
        input.disabled = true;
        input.classList.remove('blank-correct', 'blank-wrong');
        if (result.isCorrect) {
            input.classList.add('blank-correct');
        } else {
            input.classList.add('blank-wrong');
        }
    });
}

// ==================== 单空答案比对 ====================
function compareBlankAnswer(user, correct) {
    const normalize = (str) => {
        return str
            .toLowerCase()
            .replace(/[，。、；：""''（）【】]/g, '')
            .replace(/[,\.;:\"\'\(\)\[\]]/g, '')
            .replace(/[~～]/g, '-')
            .replace(/\s+/g, '')
            .trim();
    };

    const normUser = normalize(user);
    const normCorrect = normalize(correct);

    // 直接匹配
    if (normUser === normCorrect) return true;

    // 检查正确答案是否包含多个并列项（如"A、B、C"）
    const delimiters = /[、,和]/;
    const correctParts = normCorrect.split(delimiters).map(s => s.trim()).filter(s => s);
    const userParts = normUser.split(delimiters).map(s => s.trim()).filter(s => s);

    if (correctParts.length > 1) {
        // 多部分答案：顺序无关比较
        if (userParts.length !== correctParts.length) return false;
        const sortedCorrect = [...correctParts].sort();
        const sortedUser = [...userParts].sort();
        return sortedCorrect.every((part, i) => part === sortedUser[i]);
    }

    // 单部分：包含关系检查
    if (normUser.includes(normCorrect) || normCorrect.includes(normUser)) {
        const longer = Math.max(normUser.length, normCorrect.length);
        const shorter = Math.min(normUser.length, normCorrect.length);
        if (shorter / longer >= 0.8) return true;
    }

    // 单部分：Levenshtein 距离
    const distance = levenshteinDistance(normUser, normCorrect);
    const similarity = 1 - distance / Math.max(normUser.length, normCorrect.length);
    return similarity >= 0.85;
}

// ==================== 自由文本答案比对 ====================
function compareAnswer(user, correct) {
    const stripPrefix = (str) => {
        return str
            .replace(/^答案[：:]\s*/, '')
            .replace(/^答[：:]\s*/, '')
            .trim();
    };

    const normalize = (str) => {
        return str
            .toLowerCase()
            .replace(/[，。、；：""''（）【】]/g, '')
            .replace(/[,\.;:\"\'\(\)\[\]]/g, '')
            .replace(/[~～]/g, '-')
            .replace(/\s+/g, '')
            .trim();
    };

    const u = normalize(stripPrefix(user));
    const c = normalize(stripPrefix(correct));

    if (u === c) return true;

    if (u.includes(c) || c.includes(u)) {
        const longer = Math.max(u.length, c.length);
        const shorter = Math.min(u.length, c.length);
        if (shorter / longer >= 0.8) return true;
    }

    const distance = levenshteinDistance(u, c);
    const similarity = 1 - distance / Math.max(u.length, c.length);
    return similarity >= 0.85;
}

function levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// ==================== 直接看答案 ====================
document.getElementById('show-answer-btn').addEventListener('click', () => {
    const q = currentQuestions[currentIndex];

    document.getElementById('result-area').classList.remove('hidden');
    document.getElementById('result-area').className = 'wrong';
    document.getElementById('result-icon').textContent = '!';
    document.getElementById('result-text').textContent = '已查看答案';
    document.querySelector('.result-header').className = 'result-header wrong';

    const displayAnswer = (q._parsed && q._parsed.hasBlanks) ? q._parsed.fullAnswer : q.answer;
    document.getElementById('correct-text').textContent = displayAnswer;

    // 填空模式：将正确答案填入输入框
    if (q._parsed && q._parsed.hasBlanks) {
        const inputs = document.querySelectorAll('.blank-input');
        inputs.forEach((input, index) => {
            input.value = q._parsed.answerParts[index] || '';
            input.disabled = true;
            input.classList.remove('blank-correct', 'blank-wrong');
            input.classList.add('blank-correct');
        });
    } else {
        document.getElementById('user-answer').disabled = true;
    }

    stats.skip++;
    wrongQuestions.add(q.id);

    wrongCounts[q.id] = (wrongCounts[q.id] || 0) + 1;

    localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));

    localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));

    document.getElementById('submit-btn').classList.add('hidden');
    document.getElementById('next-btn').classList.remove('hidden');
    document.getElementById('retry-btn').classList.add('hidden');
    document.getElementById('show-answer-btn').classList.add('hidden');
});

// ==================== 重做此题 ====================
document.getElementById('retry-btn').addEventListener('click', () => {
    const q = currentQuestions[currentIndex];
    const resultArea = document.getElementById('result-area');
    resultArea.classList.add('hidden');
    resultArea.className = 'hidden';

    if (q._parsed && q._parsed.hasBlanks) {
        // 填空模式：清空所有输入框，移除反馈样式
        const inputs = document.querySelectorAll('.blank-input');
        inputs.forEach((input, index) => {
            input.value = '';
            input.disabled = false;
            input.classList.remove('blank-correct', 'blank-wrong');
            if (index === 0) {
                setTimeout(() => input.focus(), 0);
            }
        });
    } else {
        const textarea = document.getElementById('user-answer');
        textarea.value = '';
        textarea.disabled = false;
        textarea.focus();
    }

    document.getElementById('submit-btn').classList.remove('hidden');
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('retry-btn').classList.add('hidden');
    document.getElementById('show-answer-btn').classList.remove('hidden');
});

// ==================== 下一题 ====================
document.getElementById('next-btn').addEventListener('click', () => {
    currentIndex++;
    if (currentIndex >= currentQuestions.length) {
        showResult();
    } else {
        showQuestion();
    }
});

// ==================== 跳过 ====================
document.getElementById('skip-btn').addEventListener('click', () => {
    const q = currentQuestions[currentIndex];
    wrongQuestions.add(q.id);

    wrongCounts[q.id] = (wrongCounts[q.id] || 0) + 1;

    localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));

    localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));
    stats.skip++;

    currentIndex++;
    if (currentIndex >= currentQuestions.length) {
        showResult();
    } else {
        showQuestion();
    }
});

// ==================== 结束复习 ====================
document.getElementById('end-btn').addEventListener('click', () => {
    if (confirm('确定要结束本轮复习吗？')) {
        showResult();
    }
});

// ==================== 返回首页 ====================
document.getElementById('back-home-btn').addEventListener('click', () => {
    if (confirm('返回首页将结束本轮复习，确定吗？')) {
        showConfigScreen();
    }
});

// ==================== 结果界面 ====================
function showResult() {
    showScreen('result');

    document.getElementById('total-count').textContent = stats.total;
    document.getElementById('correct-count').textContent = stats.correct;
    document.getElementById('wrong-count').textContent = stats.wrong;
    document.getElementById('skip-count').textContent = stats.skip;

    // 显示错题
    const wrongList = document.getElementById('wrong-list');
    if (stats.wrongList.length === 0) {
        wrongList.innerHTML = '<p style="text-align:center;color:#718096;">本轮没有错题，太棒了！</p>';
    } else {
        wrongList.innerHTML = stats.wrongList.map(item => `
            <div class="wrong-item">
                <div class="q">${item.question}</div>
                <div class="u">你的答案：${item.userAnswer || '(未作答)'}</div>
                <div class="a">正确答案：${item.correctAnswer}</div>
            </div>
        `).join('');
    }

    // 更新结果页上传云端按钮显示
    updateCloudUploadButtons();

    // 添加"继续做其他题目"按钮（如果有未选中的题目）
    addContinueOtherQuestionsButton();
}

// ==================== 添加继续做其他题目按钮 ====================
function addContinueOtherQuestionsButton() {
    // 移除已有的按钮
    const existingBtn = document.getElementById('continue-other-btn');
    if (existingBtn) existingBtn.remove();

    // 获取未选中的题目
    const selectedChapters = getSelectedChapters();
    if (selectedChapters.includes('all')) return; // 全部章节已选，不需要继续

    const unselectedQuestions = questions.filter(q => !selectedChapters.includes(q.chapter));
    if (unselectedQuestions.length === 0) return; // 没有未选中的题目

    // 创建继续按钮
    const btnGroup = document.querySelector('#result-screen .btn-group');
    const continueBtn = document.createElement('button');
    continueBtn.id = 'continue-other-btn';
    continueBtn.className = 'secondary-btn';
    continueBtn.style.cssText = 'background: #38a169; color: white; border-color: #38a169;';
    continueBtn.innerHTML = `📚 继续做其他 ${unselectedQuestions.length} 道未选中题目`;

    continueBtn.addEventListener('click', () => {
        // 切换到全部章节
        document.querySelector('input[value="all"]').checked = true;
        renderChapterList();
        startQuiz();
    });

    btnGroup.appendChild(continueBtn);
}

// ==================== 再来一轮 / 只练错题 ====================
document.getElementById('restart-btn').addEventListener('click', () => {
    showConfigScreen();
});

document.getElementById('wrong-only-btn').addEventListener('click', () => {
    document.querySelector('input[name="type"][value="wrong"]').checked = true;
    startQuiz();
});

// ==================== 错题库功能 ====================

// 批量选择状态
let selectedWrongIds = new Set();

// 打开错题库
document.getElementById('wrong-bank-btn').addEventListener('click', showWrongBank);
document.getElementById('back-from-wrong').addEventListener('click', () => showConfigScreen());

// 搜索
document.getElementById('wrong-search-btn').addEventListener('click', renderWrongBank);
document.getElementById('wrong-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') renderWrongBank();
});

// 全选/取消全选
document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.wrong-bank-item .item-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const id = parseInt(cb.dataset.id);
        if (e.target.checked) {
            selectedWrongIds.add(id);
        } else {
            selectedWrongIds.delete(id);
        }
    });
    updateBatchUI();
});

// 批量删除
document.getElementById('batch-delete-btn').addEventListener('click', () => {
    const count = selectedWrongIds.size;
    if (count === 0) return;
    if (confirm(`确定要删除选中的 ${count} 道错题吗？`)) {
        selectedWrongIds.forEach(id => {
            wrongQuestions.delete(id);
            delete wrongCounts[id];
        });
        localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));
        localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));
        selectedWrongIds.clear();
        renderWrongBank();
    }
});

// 清空错题
document.getElementById('clear-wrong-btn').addEventListener('click', () => {
    const count = wrongQuestions.size;
    if (count === 0) {
        alert('错题库为空');
        return;
    }
    if (confirm(`确定要清空全部 ${count} 道错题吗？此操作不可恢复。`)) {
        wrongQuestions.clear();
        wrongCounts = {};
        selectedWrongIds.clear();
        localStorage.setItem('wrongCounts', JSON.stringify({}));
        localStorage.setItem('wrongQuestions', JSON.stringify([]));
        renderWrongBank();
        showConfigScreen();
    }
});

// 导出错题
document.getElementById('export-wrong-btn').addEventListener('click', exportWrongQuestions);

function showWrongBank() {
    showScreen('wrongBank');
    selectedWrongIds.clear();
    renderWrongBank();
}

function updateBatchUI() {
    const count = selectedWrongIds.size;
    document.getElementById('batch-selected-count').textContent = `已选 ${count} 题`;
    const batchBtn = document.getElementById('batch-delete-btn');
    if (count > 0) {
        batchBtn.classList.remove('hidden');
        batchBtn.textContent = `批量删除 (${count})`;
    } else {
        batchBtn.classList.add('hidden');
    }
}

function renderWrongBank() {
    const searchTerm = document.getElementById('wrong-search').value.trim().toLowerCase();

    let wrongList = questions.filter(q => wrongQuestions.has(q.id));

    if (searchTerm) {
        wrongList = wrongList.filter(q =>
            q.question.toLowerCase().includes(searchTerm) ||
            q.answer.toLowerCase().includes(searchTerm) ||
            q.chapter.toLowerCase().includes(searchTerm)
        );
    }

    const totalWrong = questions.filter(q => wrongQuestions.has(q.id)).length;
    document.getElementById('wrong-bank-stats').innerHTML = `
        共 <strong>${totalWrong}</strong> 道错题
        ${searchTerm ? `，搜索匹配 <strong>${wrongList.length}</strong> 道` : ''}
    `;

    const container = document.getElementById('wrong-bank-list');
    const batchBar = document.getElementById('batch-bar');

    if (wrongList.length === 0) {
        batchBar.classList.add('hidden');
        container.innerHTML = `
            <div class="empty-state">
                <span class="icon">📝</span>
                <p>${totalWrong === 0 ? '暂无错题，继续加油！' : '没有找到匹配的题目'}</p>
            </div>
        `;
        return;
    }

    batchBar.classList.remove('hidden');

    container.innerHTML = wrongList.map(q => {
        const count = wrongCounts[q.id] || 1;
        const isSelected = selectedWrongIds.has(q.id);
        return `
        <div class="wrong-bank-item" data-id="${q.id}">
            <input type="checkbox" class="item-checkbox" data-id="${q.id}" ${isSelected ? 'checked' : ''}>
            <div class="item-content">
                <div class="item-header">
                    <span class="item-chapter">${escapeHtml(q.chapter)}</span>
                    <div class="item-question">${escapeHtml(q.question)}
                        <span class="item-wrong-count">错 ${count} 次</span>
                    </div>
                </div>
                <div class="item-answer">${escapeHtml(q.answer)}</div>
                <div class="item-actions">
                    <button class="item-practice-btn" onclick="practiceSingle(${q.id})">单独练习</button>
                    <button class="item-remove-btn" onclick="removeFromWrong(${q.id})">移出错题</button>
                </div>
            </div>
        </div>
    `}).join('');

    // 绑定 checkbox 事件
    container.querySelectorAll('.item-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id);
            if (e.target.checked) {
                selectedWrongIds.add(id);
            } else {
                selectedWrongIds.delete(id);
            }
            updateBatchUI();
        });
    });

    updateBatchUI();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 单独练习一道题
function practiceSingle(id) {
    const q = questions.find(item => item.id === id);
    if (!q) return;

    currentQuestions = [q];
    currentIndex = 0;
    stats = { total: 1, correct: 0, wrong: 0, skip: 0, wrongList: [] };

    showScreen('quiz');
    showQuestion();
}

// 移出错题
function removeFromWrong(id) {
    wrongQuestions.delete(id);
    delete wrongCounts[id];
    localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));
    localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));
    renderWrongBank();
}

// 导出错题为 Excel
function exportWrongQuestions() {
    const wrongList = questions.filter(q => wrongQuestions.has(q.id));

    if (wrongList.length === 0) {
        alert('错题库为空，无需导出');
        return;
    }

    const data = [
        ['章节', '题目', '答案']
    ];

    wrongList.forEach(q => {
        data.push([q.chapter, q.question, q.answer]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '错题库');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `一建错题库_${date}.xlsx`);
}

// ==================== 数据导出 ====================
function exportData() {
    const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        questions: questions,
        wrongCounts: wrongCounts
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `一建数据_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 首页导出按钮
document.getElementById('export-btn').addEventListener('click', exportData);
// 配置页导出按钮
document.getElementById('config-export-btn').addEventListener('click', exportData);

// ==================== 数据导入 ====================
let pendingImportData = null;

document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // 验证数据结构
        if (!data.questions || !Array.isArray(data.questions)) {
            alert('文件格式错误：未找到题库数据');
            return;
        }

        pendingImportData = data;

        const existingCount = questions.length;
        const importCount = data.questions.length;
        const importWrongCount = data.wrongCounts ? Object.keys(data.wrongCounts).length : 0;

        if (existingCount === 0) {
            // 当前无数据，直接覆盖
            applyImport(data, 'overwrite');
        } else {
            // 显示选择弹窗
            document.getElementById('import-modal-text').innerHTML = `
                检测到当前已有 <strong>${existingCount}</strong> 道题目，
                导入文件包含 <strong>${importCount}</strong> 道题目
                ${importWrongCount > 0 ? `和 <strong>${importWrongCount}</strong> 条错题记录` : ''}。<br><br>
                请选择导入方式：
            `;
            document.getElementById('import-modal').style.display = 'flex';
        }
    } catch (err) {
        alert('导入失败：' + err.message);
    }

    // 清空 input 以便重复选择同一文件
    e.target.value = '';
});

// 导入弹窗按钮
document.getElementById('import-overwrite-btn').addEventListener('click', () => {
    if (pendingImportData) {
        if (confirm('覆盖将丢失当前设备上的所有数据，确定吗？')) {
            applyImport(pendingImportData, 'overwrite');
            closeImportModal();
        }
    }
});

document.getElementById('import-merge-btn').addEventListener('click', () => {
    if (pendingImportData) {
        applyImport(pendingImportData, 'merge');
        closeImportModal();
    }
});

document.getElementById('import-cancel-btn').addEventListener('click', closeImportModal);

function closeImportModal() {
    document.getElementById('import-modal').style.display = 'none';
    pendingImportData = null;
}

function applyImport(data, mode) {
    if (mode === 'overwrite') {
        // 完全覆盖
        questions = data.questions;
        wrongCounts = data.wrongCounts || {};
    } else {
        // 合并：题库去重合并，错题次数取最大值
        const existingIds = new Set(questions.map(q => q.id));
        data.questions.forEach(q => {
            if (!existingIds.has(q.id)) {
                questions.push(q);
            }
        });

        if (data.wrongCounts) {
            Object.entries(data.wrongCounts).forEach(([id, count]) => {
                const numId = parseInt(id, 10);
                wrongCounts[numId] = Math.max(wrongCounts[numId] || 0, count);
            });
        }
    }

    // 重建章节集合
    chapters = new Set();
    questions.forEach(q => {
        if (q.chapter) chapters.add(q.chapter);
    });

    // 重建错题集合
    wrongQuestions = new Set(Object.keys(wrongCounts).map(Number));

    // 保存到 localStorage
    localStorage.setItem('questions', JSON.stringify(questions));
    localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));
    localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestions]));

    // 刷新界面
    if (questions.length > 0) {
        document.getElementById('home-actions').style.display = 'block';
    }

    alert(`导入成功！共 ${questions.length} 道题目，${wrongQuestions.size} 道错题`);
}

// ==================== 初始化：尝试加载本地缓存 ====================
function init() {
    const cached = localStorage.getItem('questions');
    if (cached) {
        try {
            questions = JSON.parse(cached);
            questions.forEach(q => {
                if (q.chapter) chapters.add(q.chapter);
            });
        } catch (e) {
            console.error('加载缓存失败', e);
        }
    }

    // 兼容旧数据：从 wrongQuestions 迁移到 wrongCounts
    const oldWrong = localStorage.getItem('wrongQuestions');
    if (oldWrong && !localStorage.getItem('wrongCounts')) {
        try {
            const ids = JSON.parse(oldWrong);
            ids.forEach(id => { wrongCounts[id] = 1; });
            localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));
        } catch (e) {
            console.error('迁移旧错题数据失败', e);
        }
    }

    // 首页显示错题本按钮（如果有缓存题目）
    if (cached && questions.length > 0) {
        document.getElementById('home-actions').style.display = 'block';
    }
}

// 首页按钮事件
document.getElementById('home-start-btn').addEventListener('click', () => {
    showConfigScreen();
    // 高亮开始复习按钮
    setTimeout(() => document.getElementById('start-btn').focus(), 100);
});

document.getElementById('home-study-btn').addEventListener('click', () => {
    showConfigScreen();
    // 高亮学习模式按钮
    setTimeout(() => document.getElementById('study-btn').focus(), 100);
});

document.getElementById('home-wrong-bank-btn').addEventListener('click', () => {
    showConfigScreen();
    showWrongBank();
});

// ==================== 初始化 ====================
async function init() {
    // 初始化 Supabase
    const supabaseReady = initSupabase();

    // 检查已有登录状态
    if (supabaseReady) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            currentUser = session.user;
        }
        updateCloudUI();
    }

    // 加载本地缓存
    const cached = localStorage.getItem('questions');
    if (cached) {
        try {
            questions = JSON.parse(cached);
            questions.forEach(q => {
                if (q.chapter) chapters.add(q.chapter);
            });
        } catch (e) {
            console.error('加载缓存失败', e);
        }
    }

    // 兼容旧数据：从 wrongQuestions 迁移到 wrongCounts
    const oldWrong = localStorage.getItem('wrongQuestions');
    if (oldWrong && !localStorage.getItem('wrongCounts')) {
        try {
            const ids = JSON.parse(oldWrong);
            ids.forEach(id => { wrongCounts[id] = 1; });
            localStorage.setItem('wrongCounts', JSON.stringify(wrongCounts));
        } catch (e) {
            console.error('迁移旧错题数据失败', e);
        }
    }

    // 首页显示按钮（如果有缓存题目）
    if (cached && questions.length > 0) {
        document.getElementById('home-actions').style.display = 'block';
    }
}

init();
