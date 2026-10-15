/**
 * GeminiChat Studio - Core Application Logic
 * Full client-side integration for Google Gemini REST API
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. Constants & Default Configurations
  // ==========================================================================

  const STORAGE_KEYS = {
    API_KEY: 'gemini_chat_api_key',
    SELECTED_MODEL: 'gemini_chat_selected_model',
    CACHED_MODELS: 'gemini_chat_cached_models',
    SESSIONS: 'gemini_chat_sessions',
    ACTIVE_SESSION: 'gemini_chat_active_session_id',
    SETTINGS: 'gemini_chat_settings',
    WEB_SEARCH: 'gemini_chat_web_search',
    HUB_SERVER_URL: 'gemini_hub_server_url'
  };

  // --------------------------------------------------------------------------
  // Hub Server URL Resolver (Supports GitHub Pages & Remote Hosting)
  // --------------------------------------------------------------------------
  function getHubServerUrl() {
    const params = new URLSearchParams(window.location.search);
    const qServer = params.get('server') || params.get('hub');
    if (qServer) {
      const clean = qServer.trim().replace(/\/+$/, '');
      localStorage.setItem(STORAGE_KEYS.HUB_SERVER_URL, clean);
      return clean;
    }
    const saved = localStorage.getItem(STORAGE_KEYS.HUB_SERVER_URL);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
    if (window.DEFAULT_HUB_SERVER) {
      return window.DEFAULT_HUB_SERVER.replace(/\/+$/, '');
    }
    // If running on GitHub Pages or custom domain, default to http://localhost:8000
    if (window.location.hostname.endsWith('github.io') || (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1') && window.location.port !== '8000')) {
      return 'http://localhost:8000';
    }
    return '';
  }

  function getApiUrl(endpoint) {
    const base = getHubServerUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
  }

  // --------------------------------------------------------------------------
  // Tool Results Markdown Fallback Formatter (Guarantees No Empty Responses!)
  // --------------------------------------------------------------------------
  function formatToolResultsFallback(executedTools) {
    if (!executedTools || executedTools.length === 0) {
      return '요청하신 작업을 처리했습니다.';
    }

    let md = '### 📋 조회 결과\n\n';
    for (const item of executedTools) {
      const { name, displayName, output } = item;
      if (!output) continue;

      // 1. NEIS Timetable
      if (name.includes('timetable') && output.timetable) {
        md += `**🏫 ${output.school || '마산중앙고등학교'} ${output.grade || 1}학년 ${output.class_num || 1}반 시간표**\n\n`;
        if (output.timetable.length === 0) {
          md += `*해당 일자의 시간표 정보가 없거나 주말/공휴일입니다.*\n\n`;
        } else {
          md += `| 날짜 | 교시 | 과목 |\n| :--- | :---: | :--- |\n`;
          output.timetable.forEach(t => {
            md += `| ${t.date} | ${t.period} | **${t.subject}** |\n`;
          });
          md += '\n';
        }
        if (output.auth_notice) {
          md += `> 💡 *${output.auth_notice}*\n\n`;
        }
        continue;
      }

      // 2. NEIS School Schedule
      if (name.includes('school_schedule') && output.schedules) {
        md += `**📅 ${output.school || '마산중앙고등학교'} 학사일정 (${output.from_date || ''} ~ ${output.to_date || ''})**\n\n`;
        if (output.schedules.length === 0) {
          md += `*해당 기간에 등록된 학사일정이 없습니다.*\n\n`;
        } else {
          output.schedules.forEach(s => {
            const hBadge = (s.holiday_type && s.holiday_type !== '해당없음') ? ` \`[${s.holiday_type}]\`` : '';
            md += `- **${s.date}**: **${s.event_name}**${hBadge} (${s.target_grades || '전학년'})\n`;
          });
          md += '\n';
        }
        continue;
      }

      // 3. RiroSchool Meals
      if (name.includes('meal')) {
        md += `**🍴 급식 식단표**\n\n`;
        if (output.lunch) md += `* **중식**: ${output.lunch}\n`;
        if (output.dinner) md += `* **석식**: ${output.dinner}\n`;
        if (output.calorie) md += `* **칼로리**: ${output.calorie}\n`;
        if (output.meals && Array.isArray(output.meals)) {
          output.meals.forEach(m => {
            md += `* **${m.date} (${m.type})**: ${m.menu} (${m.calorie || ''})\n`;
          });
        }
        md += '\n';
        continue;
      }

      // 4. RiroSchool Notices
      if (name.includes('notice') && output.notices) {
        md += `**📢 공지사항 목록**\n\n`;
        output.notices.forEach(n => {
          md += `- [${n.date || ''}] **${n.title}** (${n.author || ''})\n`;
        });
        md += '\n';
        continue;
      }

      // 5. System Status
      if (name.includes('system') || name.includes('server')) {
        md += `**💻 서버 상태**: ${output.status || 'online'} (CPU: ${output.cpu_percent || 0}%, RAM: ${output.memory_percent || 0}%)\n\n`;
        continue;
      }

      // Generic
      md += `**${displayName || name}**:\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\`\n\n`;
    }

    return md.trim();
  }

  const DEFAULT_SYSTEM_INSTRUCTION = `당신은 마산중앙고등학교(경상남도 창원시 마산합포구 소재)의 공식 스마트 AI 비서 '마산중앙고 제미나이'입니다.
- 학생, 학부모, 선생님을 친절하고 스마트하게 돕는 맞춤형 교육 도우미입니다.
- 교육부 나이스(NEIS) 연동을 통해 1~7교시 고등학교 시간표, 학사일정, 급식 식단(중식/석식)을 실시간으로 확인하고 안내합니다.
- 리로스쿨(RiroSchool) 허브 연동 시 공지사항, 가정통신문, 수행평가/과제 일정, 개인 성적 등을 조회할 수 있습니다.
- 시간표, 급식, 학사일정 등 최신 정보 문의 시 연동된 도구(Functions)를 적극적으로 호출하여 정확한 데이터를 제공하세요.
- 답변은 정중하고 가독성 높은 마크다운 표/글머리기호로 정리해 주세요.`;

  const DEFAULT_SETTINGS = {
    temperature: 1.0,
    maxOutputTokens: 8192,
    topP: 0.95,
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION
  };

  function getStandaloneFallbackTools() {
    return [
      {
        name: 'neis_get_timetable',
        description: '마산중앙고등학교 1~7교시 시간표를 조회합니다. 학년(1~3), 반(1~10), 조회 일자를 지정할 수 있습니다.',
        parameters: {
          type: 'OBJECT',
          properties: {
            grade: { type: 'INTEGER', description: '학년 (1, 2, 3)' },
            class_name: { type: 'INTEGER', description: '학급 반 번호 (예: 1반은 1)' },
            date: { type: 'STRING', description: '조회 날짜 (YYYYMMDD 형식, 비워두면 오늘)' }
          },
          required: ['grade', 'class_name']
        }
      },
      {
        name: 'neis_get_today_meal',
        description: '마산중앙고등학교 오늘의 급식 식단표(중식, 석식, 칼로리 정보)를 조회합니다.',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: '조회 날짜 (YYYYMMDD 형식, 비워두면 오늘)' }
          }
        }
      },
      {
        name: 'neis_get_school_schedule',
        description: '마산중앙고등학교 학사일정(시험, 방학, 행사, 휴업일 등)을 조회합니다.',
        parameters: {
          type: 'OBJECT',
          properties: {
            from_date: { type: 'STRING', description: '조회 시작일 (YYYYMMDD 형식)' },
            to_date: { type: 'STRING', description: '조회 종료일 (YYYYMMDD 형식)' }
          }
        }
      },
      {
        name: 'riroschool_get_notices',
        description: '마산중앙고 리로스쿨 학교 공지사항 목록을 조회합니다.',
        parameters: {
          type: 'OBJECT',
          properties: {
            page: { type: 'INTEGER', description: '페이지 번호 (기본 1)' }
          }
        }
      },
      {
        name: 'riroschool_get_assignments',
        description: '마산중앙고 리로스쿨 수행평가 및 과제방 목록을 조회합니다.',
        parameters: {
          type: 'OBJECT',
          properties: {
            page: { type: 'INTEGER', description: '페이지 번호' }
          }
        }
      },
      {
        name: 'riroschool_get_scores',
        description: '마산중앙고 리로스쿨 학생 개인 성적표를 조회합니다.',
        parameters: {
          type: 'OBJECT',
          properties: {
            term: { type: 'STRING', description: '학기 또는 시험 구분' }
          }
        }
      }
    ];
  }

  const FALLBACK_MODELS = [
    { name: 'gemini-4-argon', displayName: 'Gemini 4 Argon (최상위 프론티어)', description: 'Google DeepMind 최신 심층 추론 및 자율 에이전트 플래그십 모델', inputTokenLimit: 1048576 },
    { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', description: '최고의 추론 및 코딩 성능 플래그십 모델', inputTokenLimit: 2097152 },
    { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', description: '매우 빠르고 가벼우며 똑똑한 표준 모델', inputTokenLimit: 1048576 },
    { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', description: '차세대 고속 멀티모달 모델', inputTokenLimit: 1048576 },
    { name: 'gemini-2.0-flash-thinking-exp', displayName: 'Gemini 2.0 Flash Thinking (Exp)', description: '심층 추론 과정을 거치는 특화 모델', inputTokenLimit: 1048576 },
    { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', description: '100만 토큰 컨텍스트 지원 고성능 모델', inputTokenLimit: 2097152 },
    { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', description: '고속 응답을 위한 가성비 최적화 모델', inputTokenLimit: 1048576 }
  ];

  // ==========================================================================
  // 2. Application State
  // ==========================================================================

  const state = {
    apiKey: '',
    models: [],
    selectedModel: '',
    sessions: [],
    activeSessionId: null,
    settings: { ...DEFAULT_SETTINGS },
    webSearchEnabled: true,
    isGenerating: false,
    currentAbortController: null,
    searchQuery: '',
    attachedFiles: [],      // { name, type, data (base64 or text), mimeType, isImage }
    thinkingBudget: 1,      // 0=없음, 1=보통, 2=높음, 3=최대
    serverAvailable: false, // 로컬 허브 서버 연결 여부
    plugins: [],            // 등록된 플러그인 목록
    toolDeclarations: [],   // Gemini FunctionDeclaration 스키마
    serverStatus: null      // 서버 상태 메타데이터
  };

  // ==========================================================================
  // 3. DOM Elements Cache
  // ==========================================================================

  const dom = {
    // Layout & Navigation
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    newChatBtn: document.getElementById('newChatBtn'),

    // Model Selector
    modelSelect: document.getElementById('modelSelect'),
    refreshModelsBtn: document.getElementById('refreshModelsBtn'),
    modelTypeBadge: document.getElementById('modelTypeBadge'),
    modelDesc: document.getElementById('modelDesc'),
    headerActiveModelTag: document.getElementById('headerActiveModelTag'),
    activeModelName: document.getElementById('activeModelName'),
    inputModelIndicator: document.getElementById('inputModelIndicator'),

    // Sessions
    sessionList: document.getElementById('sessionList'),
    sessionCount: document.getElementById('sessionCount'),
    sessionSearchInput: document.getElementById('sessionSearchInput'),
    currentSessionTitle: document.getElementById('currentSessionTitle'),
    exportChatBtn: document.getElementById('exportChatBtn'),
    clearChatBtn: document.getElementById('clearChatBtn'),

    // API Key Status Card
    apiKeyStatusCard: document.getElementById('apiKeyStatusCard'),
    statusDot: document.getElementById('statusDot'),
    apiKeyStatusLabel: document.getElementById('apiKeyStatusLabel'),
    apiKeyStatusSub: document.getElementById('apiKeyStatusSub'),
    openApiKeyModalBtn: document.getElementById('openApiKeyModalBtn'),

    // Chat Area
    chatContainer: document.getElementById('chatContainer'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    welcomeApiKeyCard: document.getElementById('welcomeApiKeyCard'),
    welcomeOpenKeyBtn: document.getElementById('welcomeOpenKeyBtn'),
    messagesList: document.getElementById('messagesList'),
    scrollBottomBtn: document.getElementById('scrollBottomBtn'),

    // Input Area
    messageInput: document.getElementById('messageInput'),
    charCount: document.getElementById('charCount'),
    sendMessageBtn: document.getElementById('sendMessageBtn'),
    stopGenerationBtn: document.getElementById('stopGenerationBtn'),
    toggleWebSearchBtn: document.getElementById('toggleWebSearchBtn'),
    webSearchBtnLabel: document.getElementById('webSearchBtnLabel'),
    attachFileBtn: document.getElementById('attachFileBtn'),
    fileAttachInput: document.getElementById('fileAttachInput'),
    attachmentPreview: document.getElementById('attachmentPreview'),
    thinkingBudgetSlider: document.getElementById('thinkingBudgetSlider'),
    thinkingLevelText: document.getElementById('thinkingLevelText'),

    // Model Picker
    inputModelIndicator: document.getElementById('inputModelIndicator'),
    modelPickerBackdrop: document.getElementById('modelPickerBackdrop'),
    modelPickerList: document.getElementById('modelPickerList'),
    modelPickerSearch: document.getElementById('modelPickerSearch'),
    modelPickerCloseBtn: document.getElementById('modelPickerCloseBtn'),
    refreshModelsBtnInline: document.getElementById('refreshModelsBtnInline'),

    // Modals
    webSearchModalCheckbox: document.getElementById('webSearchModalCheckbox'),
    apiKeyModal: document.getElementById('apiKeyModal'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
    saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
    removeApiKeyBtn: document.getElementById('removeApiKeyBtn'),
    closeApiKeyModalBtn: document.getElementById('closeApiKeyModalBtn'),
    keyFeedback: document.getElementById('keyFeedback'),
    keySaveSpinner: document.getElementById('keySaveSpinner'),

    settingsModal: document.getElementById('settingsModal'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    systemInstructionInput: document.getElementById('systemInstructionInput'),
    temperatureRange: document.getElementById('temperatureRange'),
    tempValueDisplay: document.getElementById('tempValueDisplay'),
    maxTokensInput: document.getElementById('maxTokensInput'),
    maxTokensValueDisplay: document.getElementById('maxTokensValueDisplay'),
    topPRange: document.getElementById('topPRange'),
    topPValueDisplay: document.getElementById('topPValueDisplay'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn'),
    clearAllHistoryBtn: document.getElementById('clearAllHistoryBtn'),
    hubServerUrlInput: document.getElementById('hubServerUrlInput'),
    hubServerStatusText: document.getElementById('hubServerStatusText'),
    testHubServerBtn: document.getElementById('testHubServerBtn'),

    // Plugin Hub Elements
    openPluginsBtn: document.getElementById('openPluginsBtn'),
    pluginsModal: document.getElementById('pluginsModal'),
    closePluginsModalBtn: document.getElementById('closePluginsModalBtn'),
    savePluginsBtn: document.getElementById('savePluginsBtn'),
    pluginActiveBadge: document.getElementById('pluginActiveBadge'),
    headerActivePluginTag: document.getElementById('headerActivePluginTag'),
    activePluginText: document.getElementById('activePluginText'),
    pluginsListContainer: document.getElementById('pluginsListContainer'),
    serverConnectionText: document.getElementById('serverConnectionText'),
    serverLanHint: document.getElementById('serverLanHint'),
    quickPromptsChips: document.getElementById('quickPromptsChips'),

    // Toasts
    toastContainer: document.getElementById('toastContainer')
  };

  // ==========================================================================
  // 4. Marked & Highlight.js Setup
  // ==========================================================================

  function setupMarkdownParser() {
    if (typeof marked !== 'undefined') {
      const renderer = new marked.Renderer();

      // Custom code block renderer with header and copy button
      renderer.code = function (codeText, lang) {
        const language = (lang || 'plaintext').toLowerCase();
        let highlighted = codeText;
        if (typeof hljs !== 'undefined' && hljs.getLanguage(language)) {
          try {
            highlighted = hljs.highlight(codeText, { language }).value;
          } catch (e) {
            highlighted = escapeHtml(codeText);
          }
        } else if (typeof hljs !== 'undefined') {
          try {
            highlighted = hljs.highlightAuto(codeText).value;
          } catch (e) {
            highlighted = escapeHtml(codeText);
          }
        } else {
          highlighted = escapeHtml(codeText);
        }

        const encodedCode = encodeURIComponent(codeText);

        return `
          <div class="code-block-container">
            <div class="code-block-header">
              <span class="code-lang-tag">${escapeHtml(language)}</span>
              <button class="btn-copy-code" data-code="${encodedCode}">
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>복사</span>
              </button>
            </div>
            <pre><code class="hljs language-${language}">${highlighted}</code></pre>
          </div>
        `;
      };

      marked.setOptions({
        renderer: renderer,
        breaks: true,
        gfm: true
      });
    }
  }

  function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked !== 'undefined') {
      try {
        return marked.parse(text);
      } catch (err) {
        console.error('Markdown parse error:', err);
        return `<p>${escapeHtml(text)}</p>`;
      }
    }
    return `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  }

  function escapeHtml(string) {
    const entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(string).replace(/[&<>"']/g, s => entityMap[s]);
  }

  // ==========================================================================
  // 5. Toast Notifications
  // ==========================================================================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#10b981" stroke-width="2" fill="none"><path d="M20 6L9 17l-5-5"></path></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#3b82f6" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  // ==========================================================================
  // 6. Persistence & State Loading
  // ==========================================================================

  function loadStateFromStorage() {
    state.apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    state.selectedModel = localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL) || 'gemini-4-argon';

    // Load Settings
    try {
      const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (storedSettings) {
        state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) };
      }
    } catch (e) {
      state.settings = { ...DEFAULT_SETTINGS };
    }

    // Load Sessions
    try {
      const storedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      if (storedSessions) {
        state.sessions = JSON.parse(storedSessions);
      }
    } catch (e) {
      state.sessions = [];
    }

    state.activeSessionId = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION) || null;

    // Load Web Search Setting (default true)
    const storedSearch = localStorage.getItem(STORAGE_KEYS.WEB_SEARCH);
    state.webSearchEnabled = storedSearch === null ? true : storedSearch === 'true';

    // Load Cached Models if available
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.CACHED_MODELS);
      if (cached) {
        state.models = JSON.parse(cached);
      } else {
        state.models = FALLBACK_MODELS;
      }
    } catch (e) {
      state.models = FALLBACK_MODELS;
    }
  }

  function updateWebSearchUI() {
    if (!dom.toggleWebSearchBtn) return;
    if (state.webSearchEnabled) {
      dom.toggleWebSearchBtn.classList.add('active');
      if (dom.webSearchBtnLabel) dom.webSearchBtnLabel.textContent = '웹 검색 ON';
      if (dom.webSearchModalCheckbox) dom.webSearchModalCheckbox.checked = true;
    } else {
      dom.toggleWebSearchBtn.classList.remove('active');
      if (dom.webSearchBtnLabel) dom.webSearchBtnLabel.textContent = '웹 검색 OFF';
      if (dom.webSearchModalCheckbox) dom.webSearchModalCheckbox.checked = false;
    }
  }

  function toggleWebSearch() {
    state.webSearchEnabled = !state.webSearchEnabled;
    localStorage.setItem(STORAGE_KEYS.WEB_SEARCH, state.webSearchEnabled);
    updateWebSearchUI();
    showToast(
      state.webSearchEnabled
        ? 'Google 실시간 웹 검색(Grounding)이 켜졌습니다.'
        : '웹 검색이 꺼졌습니다 (기본 모델 지식으로만 답변).',
      'info'
    );
  }

  function saveSessions() {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(state.sessions));
    if (state.activeSessionId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, state.activeSessionId);
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
  }

  // ==========================================================================
  // 7. Gemini API Integration
  // ==========================================================================

  /**
   * Fetch available models using user API key
   */
  async function fetchAvailableModels(apiKey = state.apiKey) {
    if (!apiKey) {
      state.models = FALLBACK_MODELS;
      populateModelDropdown();
      updateApiKeyStatusUI();
      return;
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: API 연결 실패`);
      }

      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        // Filter models that support generateContent
        const validModels = data.models
          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => {
            const cleanName = m.name.replace(/^models\//, '');
            return {
              name: cleanName,
              displayName: m.displayName || cleanName,
              description: m.description || '',
              inputTokenLimit: m.inputTokenLimit || 1048576
            };
          });

        // Priority sorting (Argon, Pro, Flash first)
        validModels.sort((a, b) => {
          const priority = ['gemini-4-argon', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-thinking-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
          const idxA = priority.indexOf(a.name);
          const idxB = priority.indexOf(b.name);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.name.localeCompare(b.name);
        });

        if (validModels.length > 0) {
          state.models = validModels;
          localStorage.setItem(STORAGE_KEYS.CACHED_MODELS, JSON.stringify(validModels));
        }
      }
    } catch (error) {
      console.warn('모델 목록 불러오기 실패, 기본 목록 사용:', error.message);
      if (!state.models || state.models.length === 0) {
        state.models = FALLBACK_MODELS;
      }
      throw error;
    } finally {
      populateModelDropdown();
      updateApiKeyStatusUI();
    }
  }

  /**
   * Validate API Key by fetching models
   */
  async function testAndSaveApiKey(inputKey) {
    const trimmedKey = inputKey.trim();
    if (!trimmedKey) {
      throw new Error('API 키를 입력해주세요.');
    }

    dom.keySaveSpinner.classList.remove('hidden');
    dom.keyFeedback.textContent = 'Google API 연결 확인 중...';
    dom.keyFeedback.className = 'api-key-validation-feedback';

    try {
      await fetchAvailableModels(trimmedKey);
      state.apiKey = trimmedKey;
      localStorage.setItem(STORAGE_KEYS.API_KEY, trimmedKey);

      dom.keyFeedback.textContent = '✓ 인증 성공! 사용 가능한 모델을 모두 로드했습니다.';
      dom.keyFeedback.className = 'api-key-validation-feedback success';
      showToast('Gemini API 키가 성공적으로 등록되었습니다.', 'success');
      updateApiKeyStatusUI();

      setTimeout(() => {
        closeApiKeyModal();
      }, 700);
    } catch (err) {
      dom.keyFeedback.textContent = `✕ 연결 실패: ${err.message}`;
      dom.keyFeedback.className = 'api-key-validation-feedback error';
      throw err;
    } finally {
      dom.keySaveSpinner.classList.add('hidden');
    }
  }

  function removeApiKey() {
    state.apiKey = '';
    localStorage.removeItem(STORAGE_KEYS.API_KEY);
    dom.apiKeyInput.value = '';
    dom.keyFeedback.textContent = 'API 키가 삭제되었습니다.';
    dom.keyFeedback.className = 'api-key-validation-feedback';
    updateApiKeyStatusUI();
    showToast('API 키가 제거되었습니다.', 'info');
    setTimeout(() => {
      closeApiKeyModal();
    }, 500);
  }

  // ==========================================================================
  // 8. Model Dropdown & Metadata
  // ==========================================================================

  function populateModelDropdown() {
    dom.modelSelect.innerHTML = '';

    if (!state.models || state.models.length === 0) {
      state.models = FALLBACK_MODELS;
    }

    state.models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = model.displayName || model.name;
      dom.modelSelect.appendChild(option);
    });

    // Check if previously selected model is in list
    const hasCurrent = state.models.some(m => m.name === state.selectedModel);
    if (!hasCurrent && state.models.length > 0) {
      state.selectedModel = state.models[0].name;
    }

    dom.modelSelect.value = state.selectedModel;
    localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, state.selectedModel);
    updateModelInfoDisplay();
  }

  function updateModelInfoDisplay() {
    const currentModelObj = state.models.find(m => m.name === state.selectedModel) || {
      name: state.selectedModel || 'gemini-2.5-flash',
      displayName: state.selectedModel || 'Gemini 2.5 Flash',
      description: 'Google Gemini 멀티모달 모델',
      inputTokenLimit: 1048576
    };

    dom.activeModelName.textContent = currentModelObj.displayName;
    // Model indicator pill 업데이트
    if (dom.inputModelIndicator) {
      dom.inputModelIndicator.textContent = currentModelObj.displayName || currentModelObj.name;
    }
    if (dom.modelDesc) dom.modelDesc.textContent = currentModelObj.description || 'Google DeepMind 최신 LLM';

    if (currentModelObj.name.includes('flash')) {
      dom.modelTypeBadge.textContent = '초고속 (Flash)';
      dom.modelTypeBadge.style.color = '#06b6d4';
      dom.modelTypeBadge.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    } else if (currentModelObj.name.includes('thinking')) {
      dom.modelTypeBadge.textContent = '사고력 (Thinking)';
      dom.modelTypeBadge.style.color = '#ec4899';
      dom.modelTypeBadge.style.borderColor = 'rgba(236, 72, 153, 0.3)';
    } else if (currentModelObj.name.includes('pro')) {
      dom.modelTypeBadge.textContent = '고성능 (Pro)';
      dom.modelTypeBadge.style.color = '#8b5cf6';
      dom.modelTypeBadge.style.borderColor = 'rgba(139, 92, 246, 0.3)';
    } else {
      dom.modelTypeBadge.textContent = '표준 모델';
      dom.modelTypeBadge.style.color = '#4f8aff';
      dom.modelTypeBadge.style.borderColor = 'rgba(79, 138, 255, 0.3)';
    }
  }

  function updateApiKeyStatusUI() {
    const hasKey = Boolean(state.apiKey && state.apiKey.length > 5);

    if (hasKey) {
      dom.statusDot.classList.add('active');
      dom.apiKeyStatusLabel.textContent = '연결됨 (API Key 활성)';
      const maskedKey = state.apiKey.slice(0, 6) + '...' + state.apiKey.slice(-4);
      dom.apiKeyStatusSub = dom.apiKeyStatusSub || document.getElementById('apiKeyStatusSub');
      dom.apiKeyStatusSub.textContent = maskedKey;
      dom.welcomeApiKeyCard.classList.add('hidden');
    } else {
      dom.statusDot.classList.remove('active');
      dom.apiKeyStatusLabel.textContent = 'API 키 미등록';
      dom.apiKeyStatusSub.textContent = '클릭하여 키 등록';
      dom.welcomeApiKeyCard.classList.remove('hidden');
    }
  }

  // ==========================================================================
  // 9. Session Management
  // ==========================================================================

  function createNewSession() {
    const newSession = {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: '새 대화',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };

    state.sessions.unshift(newSession);
    state.activeSessionId = newSession.id;
    saveSessions();
    renderSessionList();
    renderCurrentChat();
    dom.messagesList.innerHTML = '';
    dom.messageInput.value = '';
    state.attachedFiles = [];
    renderAttachmentPreview();
    adjustTextareaHeight();
    updateCharCount();
    dom.messageInput.focus();

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }

  function getActiveSession() {
    if (!state.activeSessionId && state.sessions.length > 0) {
      state.activeSessionId = state.sessions[0].id;
    }
    return state.sessions.find(s => s.id === state.activeSessionId) || null;
  }

  function switchSession(sessionId) {
    if (state.isGenerating) {
      showToast('응답 생성 중에는 대화를 전환할 수 없습니다.', 'warning');
      return;
    }
    state.activeSessionId = sessionId;
    saveSessions();
    renderSessionList();
    renderCurrentChat();

    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }

  function deleteSession(sessionId, event) {
    if (event) event.stopPropagation();

    if (confirm('이 대화 기록을 완전히 삭제하시겠습니까?')) {
      state.sessions = state.sessions.filter(s => s.id !== sessionId);

      if (state.activeSessionId === sessionId) {
        state.activeSessionId = state.sessions.length > 0 ? state.sessions[0].id : null;
      }

      saveSessions();
      renderSessionList();
      renderCurrentChat();
      showToast('대화가 삭제되었습니다.', 'info');
    }
  }

  function clearCurrentSession() {
    const session = getActiveSession();
    if (!session || session.messages.length === 0) return;

    if (confirm('현재 대화의 모든 메시지를 지우시겠습니까?')) {
      session.messages = [];
      session.title = '새 대화';
      session.updatedAt = new Date().toISOString();
      saveSessions();
      renderSessionList();
      renderCurrentChat();
      showToast('대화 내용이 초기화되었습니다.', 'info');
    }
  }

  function clearAllSessions() {
    if (confirm('모든 대화 기록을 전부 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      state.sessions = [];
      state.activeSessionId = null;
      saveSessions();
      createNewSession();
      showToast('모든 대화 기록이 초기화되었습니다.', 'info');
      closeSettingsModal();
    }
  }

  function renderSessionList() {
    dom.sessionList.innerHTML = '';
    const query = state.searchQuery.trim().toLowerCase();

    const filtered = state.sessions.filter(s => {
      if (!query) return true;
      const matchTitle = s.title.toLowerCase().includes(query);
      const matchContent = s.messages.some(m => m.content && m.content.toLowerCase().includes(query));
      return matchTitle || matchContent;
    });

    dom.sessionCount.textContent = state.sessions.length;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-session-state';
      empty.textContent = query ? '검색된 대화가 없습니다.' : '대화 기록이 없습니다.';
      dom.sessionList.appendChild(empty);
      return;
    }

    filtered.forEach(session => {
      const item = document.createElement('div');
      item.className = `session-item ${session.id === state.activeSessionId ? 'active' : ''}`;
      item.setAttribute('data-id', session.id);

      item.innerHTML = `
        <div class="session-item-content">
          <svg class="session-icon" viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="session-title" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</span>
        </div>
        <div class="session-actions">
          <button class="btn-session-delete" title="대화 삭제" aria-label="대화 삭제">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      item.addEventListener('click', () => switchSession(session.id));

      const deleteBtn = item.querySelector('.btn-session-delete');
      deleteBtn.addEventListener('click', (e) => deleteSession(session.id, e));

      dom.sessionList.appendChild(item);
    });
  }

  // ==========================================================================
  // 10. Chat Area & Message Rendering
  // ==========================================================================

  function renderCurrentChat() {
    const session = getActiveSession();

    if (!session || session.messages.length === 0) {
      dom.welcomeScreen.classList.remove('hidden');
      dom.messagesList.classList.add('hidden');
      dom.messagesList.innerHTML = '';
      dom.currentSessionTitle.textContent = '새 대화';
      dom.scrollBottomBtn.classList.remove('visible');
      return;
    }

    dom.welcomeScreen.classList.add('hidden');
    dom.messagesList.classList.remove('hidden');
    dom.currentSessionTitle.textContent = session.title;
    dom.messagesList.innerHTML = '';

    session.messages.forEach(msg => {
      appendMessageToDOM(msg, false);
    });

    scrollToBottom(false);
  }

  function appendMessageToDOM(msg, shouldScroll = true) {
    const row = document.createElement('div');
    row.className = `message-row ${msg.role === 'user' ? 'user-row' : 'ai-row'}`;
    row.id = `msg-${msg.id}`;

    const formattedTime = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let avatarHtml = '';
    if (msg.role === 'user') {
      avatarHtml = `
        <div class="message-avatar" title="사용자">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      `;
    } else {
      avatarHtml = `
        <div class="message-avatar" title="Gemini AI">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="url(#gemini-grad)"/>
          </svg>
        </div>
      `;
    }

    let metaHtml = '';
    if (msg.role === 'user') {
      metaHtml = `
        <div class="message-meta">
          <span class="message-time">${formattedTime}</span>
          <span class="sender-name">나</span>
        </div>
      `;
    } else {
      metaHtml = `
        <div class="message-meta">
          <span class="sender-name">Gemini</span>
          <span class="used-model-tag">${escapeHtml(msg.model || state.selectedModel)}</span>
          <span class="message-time">${formattedTime}</span>
        </div>
      `;
    }

    // Build attachment display HTML for user messages
    let attachmentDisplayHtml = '';
    if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
      attachmentDisplayHtml = '<div class="msg-attachments">';
      msg.attachments.forEach(att => {
        if (att.isImage && att.previewUrl) {
          attachmentDisplayHtml += `<img src="${att.previewUrl}" class="msg-att-img" alt="${escapeHtml(att.name)}" title="${escapeHtml(att.name)}">`;
        } else {
          const ext = att.name.split('.').pop().toUpperCase();
          attachmentDisplayHtml += `<span class="msg-att-file"><span class="msg-att-ext">${escapeHtml(ext)}</span>${escapeHtml(att.name)}</span>`;
        }
      });
      attachmentDisplayHtml += '</div>';
    }

    const badgesHtml = msg.toolBadges ? `<div class="tool-badges-container" style="margin-bottom:12px;">${msg.toolBadges}</div>` : '';
    const contentHtml = msg.role === 'user'
      ? `<div class="message-bubble">${attachmentDisplayHtml}${msg.content ? escapeHtml(msg.content).replace(/\n/g, '<br>') : ''}</div>`
      : `<div class="message-bubble">${badgesHtml}${renderMarkdown(msg.content)}</div>`;


    let actionsHtml = '';
    if (msg.role === 'user') {
      actionsHtml = `
        <div class="message-actions">
          <button class="btn-msg-action btn-copy-msg" data-id="${msg.id}" title="메시지 복사">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>복사</span>
          </button>
        </div>
      `;
    } else {
      actionsHtml = `
        <div class="message-actions">
          <button class="btn-msg-action btn-copy-msg" data-id="${msg.id}" title="답변 복사">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>복사</span>
          </button>
          <button class="btn-msg-action btn-regenerate-msg" data-id="${msg.id}" title="다시 생성">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>다시 생성</span>
          </button>
        </div>
      `;
    }

    row.innerHTML = `
      ${avatarHtml}
      <div class="message-body-wrap">
        ${metaHtml}
        ${contentHtml}
        ${actionsHtml}
      </div>
    `;

    dom.messagesList.appendChild(row);

    // If message has grounding metadata (sources), render them
    if (msg.role === 'model' && msg.groundingMetadata) {
      const bubble = row.querySelector('.message-bubble');
      if (bubble) {
        renderGroundingBox(bubble, msg.groundingMetadata);
      }
    }

    // Attach copy & regenerate listeners
    const copyBtn = row.querySelector('.btn-copy-msg');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyMessageContent(msg.content, copyBtn));
    }

    const regenBtn = row.querySelector('.btn-regenerate-msg');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => regenerateResponse(msg.id));
    }

    if (shouldScroll) {
      scrollToBottom();
    }

    return row;
  }

  /**
   * Render Google Search Grounding Metadata (Queries & Sources)
   */
  function renderGroundingBox(bubbleElement, groundingMetadata) {
    if (!bubbleElement || !groundingMetadata) return;

    // Check if box already rendered
    const existing = bubbleElement.querySelector('.grounding-box');
    if (existing) existing.remove();

    const queries = groundingMetadata.webSearchQueries || [];
    const chunks = (groundingMetadata.groundingChunks || []).filter(c => c && c.web && c.web.uri);

    if (queries.length === 0 && chunks.length === 0) return;

    const box = document.createElement('div');
    box.className = 'grounding-box';

    let queriesHtml = '';
    if (queries.length > 0) {
      queriesHtml = `
        <div class="grounding-queries-wrap">
          <span style="font-size:0.7rem; color:var(--text-dim); font-weight:600;">검색어:</span>
          ${queries.map(q => `<span class="grounding-query-pill">🔍 ${escapeHtml(q)}</span>`).join('')}
        </div>
      `;
    }

    let sourcesHtml = '';
    if (chunks.length > 0) {
      sourcesHtml = `
        <div class="sources-container">
          <div class="sources-title">참고 출처 및 웹 링크 (${chunks.length})</div>
          <div class="sources-grid">
            ${chunks.map((chunk, idx) => {
              const url = chunk.web.uri || '#';
              const title = chunk.web.title || url.replace(/^https?:\/\//, '').split('/')[0];
              return `
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="source-card" title="${escapeHtml(title)} - ${escapeHtml(url)}">
                  <span class="source-index">${idx + 1}</span>
                  <span class="source-title-text">${escapeHtml(title)}</span>
                  <svg class="source-external-icon" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    box.innerHTML = `
      <div class="grounding-header">
        <span class="grounding-tag">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="#22d3ee" stroke-width="2" fill="none">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          Google 실시간 웹 검색 기반 답변
        </span>
      </div>
      ${queriesHtml}
      ${sourcesHtml}
    `;

    bubbleElement.appendChild(box);
  }

  function scrollToBottom(smooth = true) {
    if (smooth) {
      dom.chatContainer.scrollTo({
        top: dom.chatContainer.scrollHeight,
        behavior: 'smooth'
      });
    } else {
      dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
    }
  }

  // ==========================================================================
  // 10.5 File Attachment Logic
  // ==========================================================================

  const THINKING_BUDGET_TOKENS = [0, 1024, 8192, 24576];
  const THINKING_BUDGET_LABELS = ['없음', '보통', '높음', '최대'];

  function updateThinkingSliderUI() {
    const v = parseInt(dom.thinkingBudgetSlider.value, 10);
    state.thinkingBudget = v;
    if (dom.thinkingLevelText) {
      dom.thinkingLevelText.textContent = THINKING_BUDGET_LABELS[v];
      // 색상 표시
      const colors = ['#6b7280', '#4f8aff', '#8b5cf6', '#ec4899'];
      dom.thinkingLevelText.style.color = colors[v];
    }
  }

  function handleFileAttach(files) {
    if (!files || files.length === 0) return;
    const allowed = Array.from(files).slice(0, 5 - state.attachedFiles.length); // max 5 파일

    allowed.forEach(file => {
      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();

      if (isImage) {
        reader.onload = (e) => {
          const base64Data = e.target.result.split(',')[1];
          state.attachedFiles.push({
            name: file.name,
            type: 'image',
            mimeType: file.type,
            data: base64Data,
            isImage: true,
            previewUrl: e.target.result
          });
          renderAttachmentPreview();
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (e) => {
          state.attachedFiles.push({
            name: file.name,
            type: 'file',
            mimeType: file.type || 'text/plain',
            data: e.target.result,
            isImage: false
          });
          renderAttachmentPreview();
        };
        reader.readAsText(file);
      }
    });
  }

  function renderAttachmentPreview() {
    if (!dom.attachmentPreview) return;
    dom.attachmentPreview.innerHTML = '';

    if (state.attachedFiles.length === 0) {
      dom.attachmentPreview.classList.remove('has-attachments');
      return;
    }
    dom.attachmentPreview.classList.add('has-attachments');

    state.attachedFiles.forEach((f, idx) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';

      if (f.isImage && f.previewUrl) {
        chip.innerHTML = `
          <img src="${f.previewUrl}" class="attachment-chip-img" alt="${escapeHtml(f.name)}">
          <span class="attachment-chip-name">${escapeHtml(f.name)}</span>
          <button class="attachment-chip-remove" data-idx="${idx}" aria-label="제거">
            <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="3" fill="none">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `;
      } else {
        const ext = f.name.split('.').pop().toUpperCase();
        chip.innerHTML = `
          <span class="attachment-chip-ext">${escapeHtml(ext)}</span>
          <span class="attachment-chip-name">${escapeHtml(f.name)}</span>
          <button class="attachment-chip-remove" data-idx="${idx}" aria-label="제거">
            <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="3" fill="none">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `;
      }

      chip.querySelector('.attachment-chip-remove').addEventListener('click', () => {
        state.attachedFiles.splice(idx, 1);
        renderAttachmentPreview();
      });

      dom.attachmentPreview.appendChild(chip);
    });
  }

  // ==========================================================================
  // 10.6 Model Picker Popup Logic
  // ==========================================================================

  function openModelPicker() {
    renderModelPickerList('');
    dom.modelPickerBackdrop.classList.add('active');
    setTimeout(() => { if (dom.modelPickerSearch) dom.modelPickerSearch.focus(); }, 100);
  }

  function closeModelPicker() {
    dom.modelPickerBackdrop.classList.remove('active');
    if (dom.modelPickerSearch) dom.modelPickerSearch.value = '';
  }

  function renderModelPickerList(query) {
    if (!dom.modelPickerList) return;
    dom.modelPickerList.innerHTML = '';

    const q = (query || '').toLowerCase();
    const filtered = state.models.filter(m =>
      !q || m.name.toLowerCase().includes(q) || (m.displayName || '').toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      dom.modelPickerList.innerHTML = '<div class="model-picker-empty">모델을 찾을 수 없습니다.</div>';
      return;
    }

    filtered.forEach(model => {
      const item = document.createElement('button');
      item.className = 'model-picker-item' + (model.name === state.selectedModel ? ' selected' : '');
      item.type = 'button';

      let badge = '';
      if (model.name.includes('flash')) badge = '<span class="mpicker-badge flash">초고속</span>';
      else if (model.name.includes('thinking')) badge = '<span class="mpicker-badge thinking">사고력</span>';
      else if (model.name.includes('pro')) badge = '<span class="mpicker-badge pro">고성능</span>';
      else badge = '<span class="mpicker-badge std">표준</span>';

      const checkmark = model.name === state.selectedModel
        ? '<svg class="mpicker-check" viewBox="0 0 24 24" width="14" height="14" stroke="#10b981" stroke-width="2.5" fill="none"><path d="M20 6L9 17l-5-5"></path></svg>'
        : '';

      item.innerHTML = `
        <div class="mpicker-item-main">
          ${badge}
          <div class="mpicker-item-info">
            <span class="mpicker-item-name">${escapeHtml(model.displayName || model.name)}</span>
            <span class="mpicker-item-desc">${escapeHtml(model.name)}</span>
          </div>
        </div>
        ${checkmark}
      `;

      item.addEventListener('click', () => {
        state.selectedModel = model.name;
        localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, model.name);
        updateModelInfoDisplay();
        showToast(`모델: ${model.displayName || model.name}`, 'success');
        closeModelPicker();
      });

      dom.modelPickerList.appendChild(item);
    });
  }

  // ==========================================================================
  // 11. Streaming Chat Implementation
  // ==========================================================================

  async function handleSendMessage() {
    const rawText = dom.messageInput.value.trim();
    const hasAttachments = state.attachedFiles.length > 0;
    if (!rawText && !hasAttachments || state.isGenerating) return;

    if (!state.apiKey) {
      openApiKeyModal();
      showToast('대화를 시작하려면 먼저 Gemini API 키를 입력해주세요.', 'warning');
      return;
    }

    // Ensure session
    let session = getActiveSession();
    if (!session) {
      createNewSession();
      session = getActiveSession();
    }

    // Set title on first message
    if (session.messages.length === 0) {
      const titleText = rawText || (state.attachedFiles.length > 0 ? `[${state.attachedFiles[0].name}]` : '새 대화');
      session.title = titleText.length > 25 ? titleText.slice(0, 25) + '...' : titleText;
      dom.currentSessionTitle.textContent = session.title;
      dom.messagesList.innerHTML = '';
    }

    // 1. Add User Message (with attachments snapshot)
    const attachmentSnapshot = [...state.attachedFiles];
    const userMsg = {
      id: 'usr_' + Date.now(),
      role: 'user',
      content: rawText,
      attachments: attachmentSnapshot,
      timestamp: Date.now()
    };
    session.messages.push(userMsg);
    saveSessions();
    renderSessionList();

    // Display in UI
    dom.welcomeScreen.classList.add('hidden');
    dom.messagesList.classList.remove('hidden');
    appendMessageToDOM(userMsg, true);

    // Clear input and attachments
    dom.messageInput.value = '';
    state.attachedFiles = [];
    renderAttachmentPreview();
    adjustTextareaHeight();
    updateCharCount();

    // 2. Prepare AI Message Placeholder
    const aiMsgId = 'ai_' + Date.now();
    const aiMsg = {
      id: aiMsgId,
      role: 'model',
      content: '',
      timestamp: Date.now(),
      model: state.selectedModel,
      groundingMetadata: null
    };
    session.messages.push(aiMsg);

    const aiRow = appendMessageToDOM(aiMsg, true);
    const bubble = aiRow.querySelector('.message-bubble');

    const searchIndicatorHtml = state.webSearchEnabled
      ? `
        <div class="searching-live-indicator">
          <span class="searching-spin-icon">🌐</span>
          <span>Google 실시간 웹 검색 및 최신 정보 탐색 중...</span>
        </div>
      `
      : '';

    bubble.innerHTML = `
      ${searchIndicatorHtml}
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;

    // 3. Start Streaming API Call (pass attachments snapshot)
    await executeGeminiStream(session, aiMsg, bubble, aiRow, attachmentSnapshot);
  }

  async function executeGeminiStream(session, aiMsg, bubbleElement, aiRow, attachmentSnapshot = []) {
    state.isGenerating = true;
    state.currentAbortController = new AbortController();
    dom.sendMessageBtn.classList.add('hidden');
    dom.stopGenerationBtn.classList.remove('hidden');

    const modelName = state.selectedModel || 'gemini-2.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(state.apiKey)}`;

    // Build multi-turn contents payload
    const contentsPayload = [];

    // All messages except the current empty AI placeholder
    const validHistory = session.messages.slice(0, session.messages.length - 1);
    for (const msg of validHistory) {
      if (msg.error || (!msg.content && (!msg.attachments || msg.attachments.length === 0))) continue;
      const parts = [];

      // 첨부 파일 parts (user 메시지에만)
      if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(att => {
          if (att.isImage) {
            parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
          } else {
            parts.push({ text: `[파일: ${att.name}]
${att.data}` });
          }
        });
      }

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        contentsPayload.push({
          role: msg.role === 'model' ? 'model' : 'user',
          parts
        });
      }
    }

    // 현재 메시지는 이미 history 안에 담겼으므로, 첨부파일은 마지막 user 메시지에 자동으로 포함됨

    // Build Generation Config
    const generationConfig = {
      temperature: parseFloat(state.settings.temperature) || 1.0,
      maxOutputTokens: parseInt(state.settings.maxOutputTokens, 10) || 8192,
      topP: parseFloat(state.settings.topP) || 0.95
    };

    // Thinking Budget
    const budgetTokens = THINKING_BUDGET_TOKENS[state.thinkingBudget];
    if (budgetTokens > 0) {
      generationConfig.thinkingConfig = { thinkingBudget: budgetTokens };
    } else {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const TOOL_NAMES_KO = {
      'riroschool_get_today_meal': '🍚 마산중앙고 오늘 급식 조회',
      'riroschool_get_weekly_meals': '🍚 이번 주 전체 급식표 조회',
      'riroschool_get_notices': '📢 리로스쿨 공지사항 검색',
      'riroschool_get_notice_detail': '📢 공지사항 상세 본문 확인',
      'riroschool_get_letters': '✉️ 가정통신문 조회',
      'riroschool_get_assignments': '📝 수행평가 및 과제 마감 확인',
      'riroschool_get_timetable': '📅 리로스쿨 시간표 조회',
      'riroschool_get_scores': '📊 내신 및 모의고사 성적표 조회',
      'riroschool_get_session_status': '🏫 리로스쿨 사용자 정보 확인',
      'neis_get_school_schedule': '📅 마산중앙고 학사일정 조회 (나이스)',
      'neis_get_timetable': '🕒 마산중앙고 정규 시간표 조회 (나이스)',
      'neis_get_school_info': '🏫 마산중앙고 학교정보 조회 (나이스)',
      'system_get_server_status': '💻 서버 PC 하드웨어 상태 확인',
      'system_get_server_time': '⏰ 서버 시간 확인'
    };

    let accumulatedText = '';
    let capturedGroundingMetadata = null;
    let turn = 0;
    const maxTurns = 4;
    let badgesContainer = null;
    let allExecutedTools = [];
    let previousTurnText = '';

    try {
      while (turn < maxTurns) {
        turn++;

        const requestBody = {
          contents: contentsPayload,
          generationConfig: generationConfig
        };

        // Tools injection: If pluggable service tools are active, use functionDeclarations!
        if (state.toolDeclarations && state.toolDeclarations.length > 0) {
          requestBody.tools = [{ functionDeclarations: state.toolDeclarations }];
        } else if (state.webSearchEnabled) {
          requestBody.tools = [{ google_search: {} }];
        }

        // Add System Instruction if present
        if (state.settings.systemInstruction && state.settings.systemInstruction.trim()) {
          requestBody.systemInstruction = {
            parts: [{ text: state.settings.systemInstruction.trim() }]
          };
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: state.currentAbortController.signal
        });

        if (!response.ok) {
          let errMsg = `HTTP ${response.status}`;
          try {
            const errData = await response.json();
            if (errData.error?.message) {
              errMsg = errData.error.message;
            }
          } catch (_) {}
          throw new Error(errMsg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let detectedFunctionCalls = [];
        let turnAccumulatedText = '';
          let turnThoughtText = '';
          let lastFinishReason = null;

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              if (buffer && buffer.trim()) {
                const lines = buffer.split('\n');
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith('data: ')) continue;
                  const jsonStr = trimmed.slice(6).trim();
                  if (!jsonStr || jsonStr === '[DONE]') continue;
                  try {
                    const data = JSON.parse(jsonStr);
                    const candidate = data.candidates?.[0];
                    if (candidate?.finishReason) lastFinishReason = candidate.finishReason;
                    const parts = candidate?.content?.parts || [];
                    for (const part of parts) {
                      if (part.thought && part.text) turnThoughtText += part.text;
                      if (part.text && !part.thought) {
                        turnAccumulatedText += part.text;
                        accumulatedText = turnAccumulatedText;
                      }
                      if (part.functionCall) {
                        detectedFunctionCalls.push({
                          call: part.functionCall,
                          rawPart: JSON.parse(JSON.stringify(part))
                        });
                      }
                    }
                  } catch (_) {}
                }
              }
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep unfinished tail line

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;

              const jsonStr = trimmed.slice(6).trim();
              if (!jsonStr || jsonStr === '[DONE]') continue;

              try {
                const data = JSON.parse(jsonStr);
                const candidate = data.candidates?.[0];

                if (candidate?.finishReason) {
                  lastFinishReason = candidate.finishReason;
                }

                if (candidate?.groundingMetadata) {
                  capturedGroundingMetadata = candidate.groundingMetadata;
                }

                const parts = candidate?.content?.parts || [];
                for (const part of parts) {
                  if (part.thought && part.text) {
                    turnThoughtText += part.text;
                  }

                  // If it's a real response text
                  if (part.text && !part.thought) {
                    turnAccumulatedText += part.text;
                    accumulatedText = turnAccumulatedText;
                    const prefixHtml = badgesContainer ? badgesContainer.outerHTML : '';
                    bubbleElement.innerHTML = prefixHtml + renderMarkdown(accumulatedText) + '<span class="stream-cursor"></span>';
                    scrollToBottom(false);
                  }

                  if (part.functionCall) {
                    detectedFunctionCalls.push({
                      call: part.functionCall,
                      rawPart: JSON.parse(JSON.stringify(part))
                    });
                  }
                }
              } catch (e) {
                // Partial chunk ignore
              }
            }
          }

          // If Gemini requested function calls, execute them on the Hub Server!
          if (detectedFunctionCalls.length > 0) {
            if (!badgesContainer) {
              badgesContainer = document.createElement('div');
              badgesContainer.className = 'tool-badges-container';
              badgesContainer.style.marginBottom = '12px';
              bubbleElement.innerHTML = '';
              bubbleElement.appendChild(badgesContainer);
            }

            // 1. Model turn with all requested function calls
            contentsPayload.push({
              role: 'model',
              parts: detectedFunctionCalls.map(item => item.rawPart)
            });

            // 2. Execute each tool on Hub Server and collect responses
            const userResponseParts = [];
            for (const item of detectedFunctionCalls) {
              const call = item.call;
              const rawName = call.name;
              const cleanName = rawName.replace(/^(default_api|tools?)[:_.]/, '');
              const displayName = TOOL_NAMES_KO[cleanName] || TOOL_NAMES_KO[rawName] || `도구 호출: ${cleanName}`;

              const badge = document.createElement('div');
              badge.className = 'tool-call-badge running';
              badge.innerHTML = `<span class="tool-spin-icon">⏳</span><span>${escapeHtml(displayName)} 실행 중...</span>`;
              badgesContainer.appendChild(badge);
              scrollToBottom(false);

              let toolOutput = null;
              let executedSuccessfully = false;

              // 1. Try Hub Server if available
              if (state.serverAvailable) {
                try {
                  const execRes = await fetch(getApiUrl('/api/tools/execute'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: cleanName, args: call.args || {} })
                  });
                  if (execRes.ok) {
                    const execData = await execRes.json();
                    if (execData.success) {
                      toolOutput = execData.result;
                      executedSuccessfully = true;
                    }
                  }
                } catch (err) {
                  console.warn('Hub server execute failed, falling back to client-side:', err);
                }
              }

              // 2. Client-side direct execution fallback (NEIS or Standalone)
              if (!executedSuccessfully) {
                const clientRes = await executeDirectClientTool(cleanName, call.args || {});
                if (clientRes && !clientRes.error) {
                  toolOutput = clientRes;
                  executedSuccessfully = true;
                } else {
                  toolOutput = clientRes || { error: '실행 실패' };
                }
              }

              if (executedSuccessfully) {
                badge.className = 'tool-call-badge success';
                badge.innerHTML = `<span>✓</span><span>${escapeHtml(displayName)} 완료</span>`;
              } else {
                badge.className = 'tool-call-badge error';
                badge.innerHTML = `<span>✕</span><span>${escapeHtml(displayName)}: ${escapeHtml(toolOutput.error || toolOutput.notice || '실행 불가')}</span>`;
              }

              allExecutedTools.push({
                name: cleanName,
                displayName: displayName,
                output: toolOutput
              });

              userResponseParts.push({
                functionResponse: {
                  name: rawName,
                  response: (typeof toolOutput === 'object' && toolOutput !== null) ? toolOutput : { output: toolOutput }
                }
              });
            }

            // 3. User turn with function responses
            contentsPayload.push({
              role: 'user',
              parts: userResponseParts
            });

            // Keep prior text and reset for subsequent answer turn
            previousTurnText = turnAccumulatedText || previousTurnText;
            turnAccumulatedText = '';
            turnThoughtText = '';
            accumulatedText = '';
            continue;
          }

          // No function calls, turn complete!
          accumulatedText = turnAccumulatedText;

          // If accumulatedText is empty, apply smart fallbacks so user never sees empty response!
          if (!accumulatedText || !accumulatedText.trim()) {
            if (allExecutedTools.length > 0) {
              accumulatedText = formatToolResultsFallback(allExecutedTools);
            } else if (turnThoughtText && turnThoughtText.trim()) {
              accumulatedText = turnThoughtText.trim();
            } else if (lastFinishReason === 'MAX_TOKENS') {
              accumulatedText = '⚠️ *(생성 토큰 한도에 도달하여 응답이 종료되었습니다. 더 구체적인 질문으로 다시 시도해 주세요.)*';
            } else if (lastFinishReason === 'SAFETY') {
              accumulatedText = '⚠️ *(안전 정책에 의해 응답이 차단되었습니다.)*';
            } else if (previousTurnText && previousTurnText.trim()) {
              accumulatedText = previousTurnText.trim();
            } else {
              accumulatedText = '요청하신 작업을 완료했으나 추가 설명 텍스트가 없습니다.';
            }
          }
          break;
        }

        // Final complete render
        const prefixHtml = badgesContainer ? badgesContainer.outerHTML : '';
        aiMsg.content = accumulatedText;
      aiMsg.groundingMetadata = capturedGroundingMetadata;
      if (badgesContainer) {
        aiMsg.toolBadges = badgesContainer.innerHTML;
      }
      bubbleElement.innerHTML = prefixHtml + renderMarkdown(aiMsg.content);

      if (capturedGroundingMetadata) {
        renderGroundingBox(bubbleElement, capturedGroundingMetadata);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        const prefixHtml = badgesContainer ? badgesContainer.outerHTML : '';
        aiMsg.content = accumulatedText + '\n\n*(생성이 사용자에 의해 중단되었습니다)*';
        aiMsg.groundingMetadata = capturedGroundingMetadata;
        if (badgesContainer) {
          aiMsg.toolBadges = badgesContainer.innerHTML;
        }
        bubbleElement.innerHTML = prefixHtml + renderMarkdown(aiMsg.content);
        if (capturedGroundingMetadata) {
          renderGroundingBox(bubbleElement, capturedGroundingMetadata);
        }
        showToast('응답 생성이 중단되었습니다.', 'info');
      } else {
        console.error('Gemini Stream Error:', err);
        let errorHelp = '';
        if (state.webSearchEnabled && (!state.toolDeclarations || state.toolDeclarations.length === 0) && (err.message.includes('tool') || err.message.includes('google_search') || err.message.includes('unsupported'))) {
          errorHelp = '\n\n💡 *안내: 현재 선택된 모델이 실시간 웹 검색 도구를 지원하지 않을 수 있습니다. 웹 검색 버튼을 끄거나 gemini-2.5-flash / gemini-2.5-pro 모델로 변경해 보세요.*';
        }

        aiMsg.content = accumulatedText
          ? accumulatedText + `\n\n> ⚠️ **생성 오류**: ${err.message}${errorHelp}`
          : `⚠️ **응답 생성 실패**: ${err.message}${errorHelp}\n\n*API 키 권한 또는 모델 가용성을 확인해 주세요.*`;
        aiMsg.error = true;
        bubbleElement.innerHTML = renderMarkdown(aiMsg.content);
        showToast(`API 오류: ${err.message}`, 'error');
      }
    } finally {
      state.isGenerating = false;
      state.currentAbortController = null;
      dom.sendMessageBtn.classList.remove('hidden');
      dom.stopGenerationBtn.classList.add('hidden');
      session.updatedAt = new Date().toISOString();
      saveSessions();
      renderSessionList();
      scrollToBottom();
    }
  }

  function stopGeneration() {
    if (state.currentAbortController) {
      state.currentAbortController.abort();
    }
  }

  async function regenerateResponse(msgId) {
    if (state.isGenerating) return;

    const session = getActiveSession();
    if (!session) return;

    const msgIndex = session.messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    // Remove this model response and any following messages
    const targetMsg = session.messages[msgIndex];
    session.messages = session.messages.slice(0, msgIndex);

    // Create fresh model message
    const newAiMsg = {
      id: 'ai_' + Date.now(),
      role: 'model',
      content: '',
      timestamp: Date.now(),
      model: state.selectedModel,
      groundingMetadata: null
    };
    session.messages.push(newAiMsg);
    saveSessions();

    // Re-render UI
    renderCurrentChat();

    // Find new bubble element
    const aiRow = document.getElementById(`msg-${newAiMsg.id}`);
    if (aiRow) {
      const bubble = aiRow.querySelector('.message-bubble');
      bubble.innerHTML = `
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      `;
      await executeGeminiStream(session, newAiMsg, bubble, aiRow);
    }
  }

  function copyMessageContent(text, btnElement) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const originalText = btnElement.innerHTML;
      btnElement.innerHTML = `
        <svg viewBox="0 0 24 24" width="12" height="12" stroke="#10b981" stroke-width="2" fill="none">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        <span style="color:#10b981;">복사됨</span>
      `;
      setTimeout(() => {
        btnElement.innerHTML = originalText;
      }, 1500);
    }).catch(() => {
      showToast('클립보드 복사 실패', 'error');
    });
  }

  // ==========================================================================
  // 12. Export & Import Functions
  // ==========================================================================

  function exportCurrentChat() {
    const session = getActiveSession();
    if (!session || session.messages.length === 0) {
      showToast('내보낼 대화 내용이 없습니다.', 'info');
      return;
    }

    const title = session.title.replace(/[/\\?%*:|"<>]/g, '_');
    let markdownContent = `# ${session.title}\n\n`;
    markdownContent += `- **생성일자**: ${new Date(session.createdAt).toLocaleString()}\n`;
    markdownContent += `- **대화 모델**: ${state.selectedModel}\n\n---\n\n`;

    session.messages.forEach(msg => {
      const sender = msg.role === 'user' ? '### 👤 사용자' : `### 🤖 Gemini (${msg.model || 'AI'})`;
      markdownContent += `${sender}\n\n${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}_대화기록.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('대화가 Markdown 파일로 저장되었습니다.', 'success');
  }

  // ==========================================================================
  // 13. Modals & Settings Management
  // ==========================================================================

  function openApiKeyModal() {
    dom.apiKeyInput.value = state.apiKey;
    dom.keyFeedback.textContent = '';
    dom.keyFeedback.className = 'api-key-validation-feedback';
    dom.apiKeyModal.classList.add('active');
    setTimeout(() => dom.apiKeyInput.focus(), 100);
  }

  function closeApiKeyModal() {
    dom.apiKeyModal.classList.remove('active');
  }

  function openSettingsModal() {
    dom.systemInstructionInput.value = state.settings.systemInstruction || '';
    dom.temperatureRange.value = state.settings.temperature;
    dom.tempValueDisplay.textContent = state.settings.temperature;
    dom.maxTokensInput.value = state.settings.maxOutputTokens;
    dom.maxTokensValueDisplay.textContent = state.settings.maxOutputTokens;
    dom.topPRange.value = state.settings.topP;
    dom.topPValueDisplay.textContent = state.settings.topP;

    if (dom.hubServerUrlInput) {
      dom.hubServerUrlInput.value = localStorage.getItem(STORAGE_KEYS.HUB_SERVER_URL) || (window.DEFAULT_HUB_SERVER || '');
      updateHubServerStatusDisplay();
    }

    dom.settingsModal.classList.add('active');
  }

  async function updateHubServerStatusDisplay() {
    if (!dom.hubServerStatusText) return;
    dom.hubServerStatusText.textContent = '연결 확인 중...';
    dom.hubServerStatusText.style.color = 'var(--text-dim)';
    const curUrl = getHubServerUrl();
    try {
      const res = await fetch(getApiUrl('/api/status'), { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        const modeText = curUrl.startsWith('https://') ? '원격 HTTPS' : '로컬';
        dom.hubServerStatusText.innerHTML = `<span style="color:#10b981;">🟢 연결됨 (${modeText})</span> <span style="font-size:0.75rem; color:var(--text-dim);">(${data.active_plugins || 0}개 플러그인, ${data.tools_count || 0}개 도구)</span>`;
        return;
      } else {
        dom.hubServerStatusText.textContent = '🔴 HTTP ' + res.status + ' 오류';
        dom.hubServerStatusText.style.color = '#ef4444';
      }
    } catch (_) {
      if (window.location.protocol === 'https:' && curUrl.startsWith('http://')) {
        dom.hubServerStatusText.innerHTML = `<span style="color:#f59e0b;">⚠️ 보안(HTTPS) 차단됨</span> <span style="font-size:0.75rem; color:var(--text-dim);">(서버의 https:// 터널 링크 사용 필요)</span>`;
      } else {
        dom.hubServerStatusText.innerHTML = `<span style="color:#ef4444;">🔴 미연결</span> <span style="font-size:0.75rem; color:var(--text-dim);">(서버 PC에서 GeminiHubServer.exe 실행 필요)</span>`;
      }
    }
  }

  function closeSettingsModal() {
    dom.settingsModal.classList.remove('active');
  }

  function saveSettingsFromModal() {
    state.settings.systemInstruction = dom.systemInstructionInput.value.trim();
    state.settings.temperature = parseFloat(dom.temperatureRange.value);
    state.settings.maxOutputTokens = parseInt(dom.maxTokensInput.value, 10) || 8192;
    state.settings.topP = parseFloat(dom.topPRange.value);

    if (dom.hubServerUrlInput) {
      const serverVal = dom.hubServerUrlInput.value.trim().replace(/\/+$/, '');
      if (serverVal) {
        localStorage.setItem(STORAGE_KEYS.HUB_SERVER_URL, serverVal);
      } else {
        localStorage.removeItem(STORAGE_KEYS.HUB_SERVER_URL);
      }
      checkHubServer();
    }

    saveSettings();
    showToast('설정이 저장되었습니다.', 'success');
    closeSettingsModal();
  }

  function resetSettingsToDefault() {
    state.settings = { ...DEFAULT_SETTINGS };
    dom.systemInstructionInput.value = '';
    dom.temperatureRange.value = DEFAULT_SETTINGS.temperature;
    dom.tempValueDisplay.textContent = DEFAULT_SETTINGS.temperature;
    dom.maxTokensInput.value = DEFAULT_SETTINGS.maxOutputTokens;
    dom.maxTokensValueDisplay.textContent = DEFAULT_SETTINGS.maxOutputTokens;
    dom.topPRange.value = DEFAULT_SETTINGS.topP;
    dom.topPValueDisplay.textContent = DEFAULT_SETTINGS.topP;
    saveSettings();
    showToast('설정이 기본값으로 초기화되었습니다.', 'info');
  }

  // ==========================================================================
  // 14. Responsive Sidebar & Textarea Handlers
  // ==========================================================================

  function toggleSidebar() {
    dom.sidebar.classList.toggle('open');
    dom.sidebarOverlay.classList.toggle('active');
  }

  function closeSidebar() {
    dom.sidebar.classList.remove('open');
    dom.sidebarOverlay.classList.remove('active');
  }

  function adjustTextareaHeight() {
    dom.messageInput.style.height = 'auto';
    const newHeight = Math.min(dom.messageInput.scrollHeight, 200);
    dom.messageInput.style.height = (newHeight > 24 ? newHeight : 24) + 'px';
  }

  function updateCharCount() {
    const len = dom.messageInput.value.length;
    dom.charCount.textContent = `${len.toLocaleString()}자`;
  }

  // ==========================================================================
  // 15. Global Event Listeners Setup
  // ==========================================================================

  function setupEventListeners() {
    // Sidebar & Mobile Nav
    dom.toggleSidebarBtn.addEventListener('click', toggleSidebar);
    dom.closeSidebarBtn.addEventListener('click', closeSidebar);
    dom.sidebarOverlay.addEventListener('click', closeSidebar);

    // New Chat
    dom.newChatBtn.addEventListener('click', () => createNewSession());

    // Model Selector Change
    dom.modelSelect.addEventListener('change', (e) => {
      state.selectedModel = e.target.value;
      localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, state.selectedModel);
      updateModelInfoDisplay();
      showToast(`모델이 '${state.selectedModel}'로 변경되었습니다.`, 'info');
    });

    // Refresh Models
    dom.refreshModelsBtn.addEventListener('click', async () => {
      if (!state.apiKey) {
        showToast('API 키를 먼저 등록해주세요.', 'warning');
        openApiKeyModal();
        return;
      }
      try {
        dom.refreshModelsBtn.style.animation = 'spin 0.6s linear';
        await fetchAvailableModels(state.apiKey);
        showToast('모델 목록이 새로고침되었습니다.', 'success');
      } catch (err) {
        showToast(`새로고침 실패: ${err.message}`, 'error');
      } finally {
        setTimeout(() => { dom.refreshModelsBtn.style.animation = ''; }, 600);
      }
    });

    // Search Sessions
    dom.sessionSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderSessionList();
    });

    // API Key Status Card Click
    dom.apiKeyStatusCard.addEventListener('click', openApiKeyModal);
    dom.openApiKeyModalBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openApiKeyModal();
    });
    dom.welcomeOpenKeyBtn.addEventListener('click', openApiKeyModal);

    // API Key Modal Actions
    dom.closeApiKeyModalBtn.addEventListener('click', closeApiKeyModal);
    dom.apiKeyModal.addEventListener('click', (e) => {
      if (e.target === dom.apiKeyModal) closeApiKeyModal();
    });

    dom.toggleApiKeyVisibility.addEventListener('click', () => {
      const isPassword = dom.apiKeyInput.type === 'password';
      dom.apiKeyInput.type = isPassword ? 'text' : 'password';
      const eyeIcon = document.getElementById('eyeIcon');
      if (isPassword) {
        eyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        eyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });

    dom.saveApiKeyBtn.addEventListener('click', () => {
      testAndSaveApiKey(dom.apiKeyInput.value);
    });

    dom.removeApiKeyBtn.addEventListener('click', removeApiKey);

    dom.apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        testAndSaveApiKey(dom.apiKeyInput.value);
      }
    });

    // Settings Modal
    dom.openSettingsBtn.addEventListener('click', openSettingsModal);
    dom.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === dom.settingsModal) closeSettingsModal();
    });

    dom.temperatureRange.addEventListener('input', (e) => {
      dom.tempValueDisplay.textContent = e.target.value;
    });

    dom.maxTokensInput.addEventListener('input', (e) => {
      dom.maxTokensValueDisplay.textContent = e.target.value;
    });

    dom.topPRange.addEventListener('input', (e) => {
      dom.topPValueDisplay.textContent = e.target.value;
    });

    dom.saveSettingsBtn.addEventListener('click', saveSettingsFromModal);
    dom.resetSettingsBtn.addEventListener('click', resetSettingsToDefault);
    dom.clearAllHistoryBtn.addEventListener('click', clearAllSessions);

    // Chat Actions
    dom.exportChatBtn.addEventListener('click', exportCurrentChat);
    dom.clearChatBtn.addEventListener('click', clearCurrentSession);

    // Chat Input & Keydown
    dom.messageInput.addEventListener('input', () => {
      adjustTextareaHeight();
      updateCharCount();
    });

    dom.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    dom.sendMessageBtn.addEventListener('click', handleSendMessage);
    dom.stopGenerationBtn.addEventListener('click', stopGeneration);

    // Scroll-to-bottom Floating Button
    dom.chatContainer.addEventListener('scroll', () => {
      const threshold = 150;
      const isScrolledUp = dom.chatContainer.scrollHeight - dom.chatContainer.scrollTop - dom.chatContainer.clientHeight > threshold;
      if (isScrolledUp) {
        dom.scrollBottomBtn.classList.add('visible');
      } else {
        dom.scrollBottomBtn.classList.remove('visible');
      }
    });

    dom.scrollBottomBtn.addEventListener('click', () => {
      scrollToBottom(true);
    });

    // Suggestion Cards Click
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        if (prompt) {
          dom.messageInput.value = prompt;
          adjustTextareaHeight();
          updateCharCount();
          handleSendMessage();
        }
      });
    });

    // Delegated Code Block Copy
    document.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.btn-copy-code');
      if (copyBtn) {
        const encodedCode = copyBtn.getAttribute('data-code');
        if (encodedCode) {
          const rawCode = decodeURIComponent(encodedCode);
          navigator.clipboard.writeText(rawCode).then(() => {
            const span = copyBtn.querySelector('span');
            if (span) {
              const orig = span.textContent;
              span.textContent = '복사됨!';
              copyBtn.style.color = '#10b981';
              setTimeout(() => {
                span.textContent = orig;
                copyBtn.style.color = '';
              }, 1500);
            }
          }).catch(() => {
            showToast('코드 복사 실패', 'error');
          });
        }
      }
    });

    // Web Search Toggle
    if (dom.toggleWebSearchBtn) {
      dom.toggleWebSearchBtn.addEventListener('click', toggleWebSearch);
    }
    if (dom.webSearchModalCheckbox) {
      dom.webSearchModalCheckbox.addEventListener('change', (e) => {
        state.webSearchEnabled = e.target.checked;
        localStorage.setItem(STORAGE_KEYS.WEB_SEARCH, state.webSearchEnabled);
        updateWebSearchUI();
        showToast(
          state.webSearchEnabled
            ? 'Google 실시간 웹 검색이 활성화되었습니다.'
            : '웹 검색이 비활성화되었습니다.',
          'info'
        );
      });
    }

    // File Attachment
    if (dom.attachFileBtn && dom.fileAttachInput) {
      dom.attachFileBtn.addEventListener('click', () => {
        dom.fileAttachInput.click();
      });
      dom.fileAttachInput.addEventListener('change', (e) => {
        handleFileAttach(e.target.files);
        e.target.value = ''; // reset input
      });
    }

    // Drag & Drop on textarea
    if (dom.messageInput) {
      dom.messageInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.messageInput.classList.add('drag-over');
      });
      dom.messageInput.addEventListener('dragleave', () => {
        dom.messageInput.classList.remove('drag-over');
      });
      dom.messageInput.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.messageInput.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
          handleFileAttach(e.dataTransfer.files);
        }
      });

      // Paste image from clipboard
      dom.messageInput.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        const imageItems = Array.from(items).filter(i => i.type.startsWith('image/'));
        if (imageItems.length > 0) {
          const files = imageItems.map(i => i.getAsFile()).filter(Boolean);
          if (files.length > 0) {
            handleFileAttach(files);
          }
        }
      });
    }

    // Thinking Budget Slider
    if (dom.thinkingBudgetSlider) {
      dom.thinkingBudgetSlider.addEventListener('input', updateThinkingSliderUI);
      updateThinkingSliderUI();
    }

    // Model Picker
    if (dom.inputModelIndicator) {
      dom.inputModelIndicator.addEventListener('click', openModelPicker);
    }
    if (dom.modelPickerCloseBtn) {
      dom.modelPickerCloseBtn.addEventListener('click', closeModelPicker);
    }
    if (dom.modelPickerBackdrop) {
      dom.modelPickerBackdrop.addEventListener('click', (e) => {
        if (e.target === dom.modelPickerBackdrop) closeModelPicker();
      });
    }
    if (dom.modelPickerSearch) {
      dom.modelPickerSearch.addEventListener('input', (e) => {
        renderModelPickerList(e.target.value);
      });
    }
    if (dom.refreshModelsBtnInline) {
      dom.refreshModelsBtnInline.addEventListener('click', async () => {
        if (!state.apiKey) {
          showToast('API 키를 먼저 등록해주세요.', 'warning');
          closeModelPicker();
          openApiKeyModal();
          return;
        }
        try {
          dom.refreshModelsBtnInline.style.opacity = '0.5';
          await fetchAvailableModels(state.apiKey);
          renderModelPickerList(dom.modelPickerSearch?.value || '');
          showToast('모델 목록이 새로고침되었습니다.', 'success');
        } catch (err) {
          showToast(`새로고침 실패: ${err.message}`, 'error');
        } finally {
          dom.refreshModelsBtnInline.style.opacity = '';
        }
      });
    }
    // Plugins Modal Listeners
    if (dom.openPluginsBtn) {
      dom.openPluginsBtn.addEventListener('click', openPluginsModal);
    }
    if (dom.closePluginsModalBtn) {
      dom.closePluginsModalBtn.addEventListener('click', closePluginsModal);
    }
    if (dom.savePluginsBtn) {
      dom.savePluginsBtn.addEventListener('click', closePluginsModal);
    }
    if (dom.pluginsModal) {
      dom.pluginsModal.addEventListener('click', (e) => {
        if (e.target === dom.pluginsModal) closePluginsModal();
      });
    }

    // Quick Prompt Chips
    if (dom.quickPromptsChips) {
      dom.quickPromptsChips.querySelectorAll('.prompt-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const prompt = btn.getAttribute('data-prompt');
          if (prompt && dom.messageInput) {
            dom.messageInput.value = prompt;
            adjustTextareaHeight();
            updateCharCount();
            closePluginsModal();
            dom.messageInput.focus();
          }
        });
      });
    }

    // Hub Server Connection Test Button
    if (dom.testHubServerBtn) {
      dom.testHubServerBtn.addEventListener('click', async () => {
        if (dom.hubServerUrlInput) {
          const val = dom.hubServerUrlInput.value.trim().replace(/\/+$/, '');
          if (val) localStorage.setItem(STORAGE_KEYS.HUB_SERVER_URL, val);
          else localStorage.removeItem(STORAGE_KEYS.HUB_SERVER_URL);
        }
        await updateHubServerStatusDisplay();
        await checkHubServer();
        if (state.serverAvailable) {
          showToast('허브 서버에 성공적으로 연결되었습니다!', 'success');
        } else {
          showToast('허브 서버에 연결할 수 없습니다. 서버 PC에서 GeminiHubServer.exe가 켜져 있는지 확인해 주세요.', 'error');
        }
      });
    }

    // Global Escape Key to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeApiKeyModal();
        closeSettingsModal();
        closeModelPicker();
        closeSidebar();
        closePluginsModal();
      }
    });
  }

  // ==========================================================================
  // 15.5 Pluggable Services & Hub Server Integration
  // ==========================================================================

  const NEIS_KEY = '0c27c5193f7f45019e499af586e380f5';
  const NEIS_OFFICE = 'S10';
  const NEIS_SCHOOL = '9010094';

  async function executeDirectClientTool(name, args) {
    const today = new Date();
    const yyyymmdd = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');

    // 1. NEIS Timetable (1~7교시 완전 조회)
    if (name.includes('timetable')) {
      const grade = args.grade || 1;
      const classNum = args.class_name || args.class_num || 1;
      const date = (args.date ? String(args.date).replace(/[^0-9]/g, '') : yyyymmdd);
      const url = `https://open.neis.go.kr/hub/hisTimetable?Type=json&pIndex=1&pSize=100&KEY=${NEIS_KEY}&ATPT_OFCDC_SC_CODE=${NEIS_OFFICE}&SD_SCHUL_CODE=${NEIS_SCHOOL}&GRADE=${grade}&CLASS_NM=${classNum}&ALL_TI_YMD=${date}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.hisTimetable && data.hisTimetable[1] && data.hisTimetable[1].row) {
          const rows = data.hisTimetable[1].row;
          const periods = rows.map(r => ({
            date: r.ALL_TI_YMD.slice(0, 4) + '-' + r.ALL_TI_YMD.slice(4, 6) + '-' + r.ALL_TI_YMD.slice(6, 8),
            period: `${r.PERIO}교시`,
            subject: r.ITRT_CNTNT ? r.ITRT_CNTNT.trim() : '수업'
          }));
          return {
            school: '마산중앙고등학교',
            grade: grade,
            class_num: classNum,
            date: date,
            total_periods: periods.length,
            timetable: periods
          };
        }
        return {
          school: '마산중앙고등학교',
          grade,
          class_num: classNum,
          date,
          timetable: [],
          message: '해당 일자의 시간표 정보가 없거나 주말/휴일입니다.'
        };
      } catch (e) {
        return { error: `나이스 시간표 조회 실패: ${e.message}` };
      }
    }

    // 2. NEIS Meals (중식, 석식, 칼로리)
    if (name.includes('meal')) {
      const date = (args.date ? String(args.date).replace(/[^0-9]/g, '') : yyyymmdd);
      const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=10&KEY=${NEIS_KEY}&ATPT_OFCDC_SC_CODE=${NEIS_OFFICE}&SD_SCHUL_CODE=${NEIS_SCHOOL}&MLSV_YMD=${date}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.mealServiceDietInfo && data.mealServiceDietInfo[1] && data.mealServiceDietInfo[1].row) {
          const rows = data.mealServiceDietInfo[1].row;
          let lunch = '', dinner = '', cal = '';
          const meals = [];
          rows.forEach(r => {
            const menuClean = (r.DDISH_NM || '').replace(/<br\s*\/?>/gi, ', ').replace(/\s*\([0-9.]+\)/g, '').trim();
            meals.push({ date: r.MLSV_YMD, type: r.MMEAL_SC_NM, menu: menuClean, calorie: r.CAL_INFO });
            if (r.MMEAL_SC_NM === '중식') { lunch = menuClean; cal = r.CAL_INFO; }
            if (r.MMEAL_SC_NM === '석식') { dinner = menuClean; }
          });
          return { date, lunch, dinner, calorie: cal, meals };
        }
        return { date, lunch: '급식 정보가 없습니다 (주말/휴일/방학 등).', dinner: '', meals: [] };
      } catch (e) {
        return { error: `나이스 급식 조회 실패: ${e.message}` };
      }
    }

    // 3. NEIS School Schedule (학사일정)
    if (name.includes('schedule') || name.includes('academic')) {
      const from = (args.from_date ? String(args.from_date).replace(/[^0-9]/g, '') : yyyymmdd.slice(0, 6) + '01');
      const to = (args.to_date ? String(args.to_date).replace(/[^0-9]/g, '') : yyyymmdd.slice(0, 4) + '1231');
      const url = `https://open.neis.go.kr/hub/SchoolSchedule?Type=json&pIndex=1&pSize=100&KEY=${NEIS_KEY}&ATPT_OFCDC_SC_CODE=${NEIS_OFFICE}&SD_SCHUL_CODE=${NEIS_SCHOOL}&AA_FROM_YMD=${from}&AA_TO_YMD=${to}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.SchoolSchedule && data.SchoolSchedule[1] && data.SchoolSchedule[1].row) {
          const rows = data.SchoolSchedule[1].row;
          const schedules = rows.map(r => ({
            date: r.AA_YMD.slice(0, 4) + '-' + r.AA_YMD.slice(4, 6) + '-' + r.AA_YMD.slice(6, 8),
            event_name: r.EVENT_NM,
            target_grades: r.ONE_GRADE_EVENT_YN === 'Y' ? '1학년' : (r.TW_GRADE_EVENT_YN === 'Y' ? '2학년' : (r.THREE_GRADE_EVENT_YN === 'Y' ? '3학년' : '전학년')),
            holiday_type: r.SBTR_DD_SC_NM
          }));
          return { school: '마산중앙고등학교', from_date: from, to_date: to, schedules };
        }
        return { school: '마산중앙고등학교', from_date: from, to_date: to, schedules: [] };
      } catch (e) {
        return { error: `나이스 학사일정 조회 실패: ${e.message}` };
      }
    }

    // 4. RiroSchool Private Data fallback notice
    if (name.includes('riroschool') || name.includes('notice') || name.includes('score') || name.includes('assignment') || name.includes('letter')) {
      return {
        notice: "마산중앙고 리로스쿨 비공개 데이터(공지사항, 성적, 과제)는 PC에서 GeminiHubServer.exe를 실행한 후 http://localhost:8000 으로 접속하시면 안전하게 실시간 조회하실 수 있습니다."
      };
    }

    return { error: `지원되지 않는 도구: ${name}` };
  }

  async function checkHubServer() {
    try {
      const res = await fetch(getApiUrl('/api/status'), { cache: 'no-cache' });
      if (!res.ok) throw new Error('Status not ok');

      const data = await res.json();
      if (data.status === 'online') {
        state.serverAvailable = true;
        state.serverStatus = data;

        // Fetch tool declarations and plugins from Hub
        await refreshPluginsData();

        // Update UI Badges
        if (dom.pluginActiveBadge) {
          dom.pluginActiveBadge.style.display = 'inline-block';
        }
        if (dom.headerActivePluginTag) {
          dom.headerActivePluginTag.style.display = 'inline-flex';
          if (dom.activePluginText) {
            dom.activePluginText.textContent = `서비스 허브 (${state.plugins.length}개 연동)`;
          }
        }
        if (dom.serverConnectionText) {
          dom.serverConnectionText.textContent = `허브 서버 연결됨 (포트 ${data.port})`;
        }
        if (dom.serverLanHint && data.lan_urls && data.lan_urls.length > 0) {
          dom.serverLanHint.textContent = `스마트폰 접속: ${data.lan_urls[0]}`;
        }
      } else {
        throw new Error('Server not online');
      }
    } catch (_) {
      // Hub server not present (standalone mode / GitHub Pages)
      state.serverAvailable = false;
      state.toolDeclarations = getStandaloneFallbackTools();
      state.plugins = [
        {
          id: 'neis',
          name: '교육부 나이스 (NEIS)',
          description: '1~7교시 고교 시간표, 학사일정, 급식 식단표 (브라우저 직접 연동)',
          enabled: true,
          tools: ['neis_get_timetable', 'neis_get_today_meal', 'neis_get_school_schedule']
        },
        {
          id: 'riroschool',
          name: '마산중앙고 리로스쿨 (허브 대기)',
          description: '공지사항, 가정통신문, 수행평가/과제, 성적 (GeminiHubServer.exe 실행 시 활성화)',
          enabled: false,
          tools: ['riroschool_get_notices', 'riroschool_get_assignments', 'riroschool_get_scores']
        }
      ];
      if (dom.pluginActiveBadge) dom.pluginActiveBadge.style.display = 'inline-block';
      if (dom.headerActivePluginTag) {
        dom.headerActivePluginTag.style.display = 'inline-flex';
        if (dom.activePluginText) {
          dom.activePluginText.textContent = `나이스 직접 연동`;
        }
      }
      if (dom.serverConnectionText) {
        dom.serverConnectionText.textContent = `나이스 직접 연동 모드 (시간표·급식 활성)`;
      }
    }
  }

  async function refreshPluginsData() {
    try {
      const [pluginsRes, declsRes] = await Promise.all([
        fetch(getApiUrl('/api/plugins')),
        fetch(getApiUrl('/api/tools/declarations'))
      ]);

      if (pluginsRes.ok) {
        const pData = await pluginsRes.json();
        state.plugins = pData.plugins || [];
      }
      if (declsRes.ok) {
        const dData = await declsRes.json();
        state.toolDeclarations = dData.declarations || [];
      }
    } catch (e) {
      console.warn('Failed to refresh plugins data:', e);
    }
  }

  function openPluginsModal() {
    if (!dom.pluginsModal) return;
    renderPluginsList();
    dom.pluginsModal.classList.add('active');
  }

  function closePluginsModal() {
    if (!dom.pluginsModal) return;
    dom.pluginsModal.classList.remove('active');
  }

  function renderPluginsList() {
    if (!dom.pluginsListContainer) return;
    dom.pluginsListContainer.innerHTML = '';

    if (!state.serverAvailable) {
      const noticeDiv = document.createElement('div');
      noticeDiv.className = 'empty-plugins-state';
      noticeDiv.style.cssText = 'padding:14px 18px; margin-bottom:14px; text-align:left; background:rgba(137,180,250,0.06); border-radius:10px; border:1px solid rgba(137,180,250,0.2);';
      noticeDiv.innerHTML = `
        <div style="font-weight:700; color:#89b4fa; font-size:0.92rem; display:flex; align-items:center; gap:6px;">
          <span>🌐</span><span>나이스(NEIS) 직접 연동 활성 (시간표·급식·일정)</span>
        </div>
        <p style="font-size:0.8rem; color:var(--text-color); margin:6px 0 0 0; line-height:1.5;">
          현재 <strong>1~7교시 시간표, 학사일정, 오늘 급식(중식/석식)</strong>이 브라우저 직접 통신(CORS)으로 100% 정상 작동 중입니다.
        </p>
        <p style="font-size:0.75rem; color:var(--text-dim); margin:6px 0 0 0;">
          💡 리로스쿨 비공개 기능(공지, 과제, 성적)을 외부에서 연동하시려면, 집 PC에서 <code>GeminiHubServer.exe</code>를 켜고 대시보드의 <strong>[원클릭 외부 연동 링크 복사]</strong>를 열어주세요.
        </p>
      `;
      dom.pluginsListContainer.appendChild(noticeDiv);
    }

    if (!state.plugins || state.plugins.length === 0) {
      return;
    }

    state.plugins.forEach(p => {
      const card = document.createElement('div');
      card.className = 'plugin-card';

      let userStatusHtml = '';
      if (p.id === 'riroschool' && p.status && p.status.user) {
        const u = p.status.user;
        if (p.status.authenticated) {
          userStatusHtml = `
            <div class="plugin-meta-status">
              <span>계정: <strong>${escapeHtml(u.user_name || '')} (${escapeHtml(u.user_type || '')})</strong></span>
              ${u.grade ? `<span>학급: <strong>${u.grade}학년 ${u.class_num}반</strong></span>` : ''}
              <span>상태: <strong style="color:#10b981;">인증 활성</strong></span>
            </div>
          `;
        } else {
          userStatusHtml = `
            <div class="plugin-meta-status">
              <span>상태: <strong style="color:#ef4444;">로그인 필요</strong></span>
            </div>
          `;
        }
      } else if (p.id === 'neis' && p.status) {
        userStatusHtml = `
          <div class="plugin-meta-status">
            <span>대상 학교: <strong>${escapeHtml(p.status.school_name || '마산중앙고등학교')} (${escapeHtml(p.status.school_code || '9010094')})</strong></span>
            <span>교육청: <strong>경상남도교육청 (${escapeHtml(p.status.office_code || 'S10')})</strong></span>
            <span>연동 상태: <strong style="color:#10b981;">교육부 공공 오픈API 활성</strong></span>
          </div>
        `;
      }

      const toolsHtml = (p.tools || []).map(t =>
        `<span class="plugin-tool-chip" title="${escapeHtml(t.description)}">${escapeHtml(t.name)}</span>`
      ).join('');

      card.innerHTML = `
        <div class="plugin-card-header">
          <div class="plugin-info-wrap">
            <div class="plugin-icon-wrap">${p.icon || '🔌'}</div>
            <div>
              <div class="plugin-name-title">
                <span>${escapeHtml(p.name)}</span>
                <span class="plugin-ver-badge">v${escapeHtml(p.version || '1.0')}</span>
              </div>
              <div class="plugin-desc">${escapeHtml(p.description || '')}</div>
            </div>
          </div>
          <label class="switch-toggle-label">
            <input type="checkbox" class="plugin-toggle-checkbox" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </div>
        ${userStatusHtml}
        <div class="plugin-tools-tags">
          ${toolsHtml}
        </div>
      `;

      card.querySelector('.plugin-toggle-checkbox').addEventListener('change', async (e) => {
        const checked = e.target.checked;
        try {
          await fetch(getApiUrl(`/api/plugins/${p.id}/toggle`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: checked })
          });
          p.enabled = checked;
          await refreshPluginsData();
          showToast(`${p.name} 플러그인이 ${checked ? '활성화' : '비활성화'}되었습니다.`, 'info');
        } catch (err) {
          showToast(`플러그인 설정 변경 실패: ${err.message}`, 'error');
        }
      });

      dom.pluginsListContainer.appendChild(card);
    });
  }

  // ==========================================================================
  // 16. App Initialization
  // ==========================================================================

  async function initApp() {
    setupMarkdownParser();
    loadStateFromStorage();
    setupEventListeners();

    // Populate initial dropdown with cached or fallback models
    populateModelDropdown();
    updateApiKeyStatusUI();
    updateWebSearchUI();

    // Detect and connect to Gemini Hub Server (RiroSchool & other services)
    checkHubServer().catch(() => {});

    // Initialize or load sessions
    if (state.sessions.length === 0) {
      createNewSession();
    } else {
      renderSessionList();
      renderCurrentChat();
    }

    // If API key is present, refresh models silently in background
    if (state.apiKey) {
      fetchAvailableModels(state.apiKey).catch(() => {});
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
