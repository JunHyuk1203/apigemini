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
    WEB_SEARCH: 'gemini_chat_web_search'
  };

  const DEFAULT_SETTINGS = {
    temperature: 1.0,
    maxOutputTokens: 8192,
    topP: 0.95,
    systemInstruction: ''
  };

  const FALLBACK_MODELS = [
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
    searchQuery: ''
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
    state.selectedModel = localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL) || '';

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

        // Priority sorting (Flash, Pro first)
        validModels.sort((a, b) => {
          const priority = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-thinking-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
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
    dom.inputModelIndicator.textContent = currentModelObj.name;
    dom.modelDesc.textContent = currentModelObj.description || 'Google DeepMind 최신 LLM';

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

    const contentHtml = msg.role === 'user'
      ? `<div class="message-bubble">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>`
      : `<div class="message-bubble">${renderMarkdown(msg.content)}</div>`;

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
  // 11. Streaming Chat Implementation
  // ==========================================================================

  async function handleSendMessage() {
    const rawText = dom.messageInput.value.trim();
    if (!rawText || state.isGenerating) return;

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
      session.title = rawText.length > 25 ? rawText.slice(0, 25) + '...' : rawText;
      dom.currentSessionTitle.textContent = session.title;
    }

    // 1. Add User Message
    const userMsg = {
      id: 'usr_' + Date.now(),
      role: 'user',
      content: rawText,
      timestamp: Date.now()
    };
    session.messages.push(userMsg);
    saveSessions();
    renderSessionList();

    // Display in UI
    dom.welcomeScreen.classList.add('hidden');
    dom.messagesList.classList.remove('hidden');
    appendMessageToDOM(userMsg, true);

    // Clear input
    dom.messageInput.value = '';
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

    // 3. Start Streaming API Call
    await executeGeminiStream(session, aiMsg, bubble, aiRow);
  }

  async function executeGeminiStream(session, aiMsg, bubbleElement, aiRow) {
    state.isGenerating = true;
    state.currentAbortController = new AbortController();
    dom.sendMessageBtn.classList.add('hidden');
    dom.stopGenerationBtn.classList.remove('hidden');

    const modelName = state.selectedModel || 'gemini-2.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(state.apiKey)}`;

    // Build multi-turn contents payload
    // Gemini API expects: role: "user" | "model"
    const contentsPayload = [];

    // Filter out errors or the current empty placeholder
    const validHistory = session.messages.slice(0, session.messages.length - 1);
    for (const msg of validHistory) {
      if (msg.error || !msg.content) continue;
      contentsPayload.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }

    // Build Generation Config
    const generationConfig = {
      temperature: parseFloat(state.settings.temperature) || 1.0,
      maxOutputTokens: parseInt(state.settings.maxOutputTokens, 10) || 8192,
      topP: parseFloat(state.settings.topP) || 0.95
    };

    const requestBody = {
      contents: contentsPayload,
      generationConfig: generationConfig
    };

    // Google Search Grounding Tool
    if (state.webSearchEnabled) {
      requestBody.tools = [
        {
          google_search: {}
        }
      ];
    }

    // Add System Instruction if present
    if (state.settings.systemInstruction && state.settings.systemInstruction.trim()) {
      requestBody.systemInstruction = {
        parts: [{ text: state.settings.systemInstruction.trim() }]
      };
    }

    let accumulatedText = '';
    let capturedGroundingMetadata = null;

    try {
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

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

            if (candidate?.groundingMetadata) {
              capturedGroundingMetadata = candidate.groundingMetadata;
            }

            const textPart = candidate?.content?.parts?.[0]?.text;
            if (textPart) {
              accumulatedText += textPart;
              // Render with streaming cursor
              bubbleElement.innerHTML = renderMarkdown(accumulatedText) + '<span class="stream-cursor"></span>';
              scrollToBottom(false);
            }
          } catch (e) {
            // Partial chunk ignore
          }
        }
      }

      // Final complete render
      aiMsg.content = accumulatedText || '(응답이 비어 있습니다)';
      aiMsg.groundingMetadata = capturedGroundingMetadata;
      bubbleElement.innerHTML = renderMarkdown(aiMsg.content);

      if (capturedGroundingMetadata) {
        renderGroundingBox(bubbleElement, capturedGroundingMetadata);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        aiMsg.content = accumulatedText + '\n\n*(생성이 사용자에 의해 중단되었습니다)*';
        aiMsg.groundingMetadata = capturedGroundingMetadata;
        bubbleElement.innerHTML = renderMarkdown(aiMsg.content);
        if (capturedGroundingMetadata) {
          renderGroundingBox(bubbleElement, capturedGroundingMetadata);
        }
        showToast('응답 생성이 중단되었습니다.', 'info');
      } else {
        console.error('Gemini Stream Error:', err);
        let errorHelp = '';
        if (state.webSearchEnabled && (err.message.includes('tool') || err.message.includes('google_search') || err.message.includes('unsupported'))) {
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

    dom.settingsModal.classList.add('active');
  }

  function closeSettingsModal() {
    dom.settingsModal.classList.remove('active');
  }

  function saveSettingsFromModal() {
    state.settings.systemInstruction = dom.systemInstructionInput.value.trim();
    state.settings.temperature = parseFloat(dom.temperatureRange.value);
    state.settings.maxOutputTokens = parseInt(dom.maxTokensInput.value, 10) || 8192;
    state.settings.topP = parseFloat(dom.topPRange.value);

    saveSettings();
    showToast('생성 파라미터가 저장되었습니다.', 'success');
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

    // Global Escape Key to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeApiKeyModal();
        closeSettingsModal();
        closeSidebar();
      }
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
