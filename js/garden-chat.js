/**
 * The Slowest Garden in the World - 실시간 정원 채팅 클라이언트 모듈
 * 1. XSS 공격 완전 차단 (textContent 및 노드 생성 전용)
 * 2. FIFO DOM 노드 제한 (최대 40개)
 * 3. 3초 전송 쿨다운 및 미확인 알림 뱃지 관리
 * 4. 포털 공통 닉네임 연동 및 데스크톱/모바일 뷰 최적화
 */

class GardenChatManager {
  constructor(socket) {
    this.socket = socket;
    this.widget = document.getElementById('chat-widget');
    this.messagesContainer = document.getElementById('chat-messages');
    this.input = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('chat-send-btn');
    this.header = document.getElementById('chat-header');
    this.closeBtn = document.getElementById('chat-close-btn');
    this.toggleBtn = document.getElementById('chat-toggle-btn');
    this.unreadBadge = document.getElementById('chat-unread-badge');
    this.nicknameBadge = document.getElementById('chat-my-nickname');

    this.nickname = localStorage.getItem('garden_nickname') || localStorage.getItem('campfire_nickname') || '';
    this.maxMessages = 40;
    this.lastSentTime = 0;
    this.chatCooldownMs = 3000;

    this.initEvents();
  }

  isOpen() {
    return this.widget && !this.widget.classList.contains('closed');
  }

  open() {
    if (!this.widget) return;
    this.widget.classList.remove('closed');
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute('aria-expanded', 'true');
      this.toggleBtn.classList.add('active');
    }
    if (this.unreadBadge) {
      this.unreadBadge.style.display = 'none';
    }
    this.scrollToBottom();
    if (window.innerWidth > 768 && this.input) {
      setTimeout(() => this.input.focus(), 150);
    }
  }

  close() {
    if (!this.widget) return;
    this.widget.classList.add('closed');
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute('aria-expanded', 'false');
      this.toggleBtn.classList.remove('active');
    }
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  setNickname(nick) {
    if (!this.nickname) {
      this.nickname = nick;
      localStorage.setItem('garden_nickname', nick);
    }
    if (this.nicknameBadge) {
      this.nicknameBadge.textContent = this.nickname;
      this.nicknameBadge.title = `내 닉네임: ${this.nickname} (클릭하여 변경)`;
    }
  }

  initEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.sendMessage());
    }

    if (this.input) {
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    if (this.nicknameBadge) {
      this.nicknameBadge.addEventListener('click', () => {
        const newNick = prompt('사용할 닉네임을 입력하세요 (최대 12자):', this.nickname);
        if (newNick && newNick.trim()) {
          const trimmed = newNick.trim().slice(0, 12);
          this.nickname = trimmed;
          localStorage.setItem('garden_nickname', trimmed);
          localStorage.setItem('campfire_nickname', trimmed);
          this.setNickname(trimmed);
        }
      });
    }

    // 소켓 이벤트 리스너 등록
    if (this.socket) {
      this.socket.on('new_garden_chat', (data) => this.appendMessage(data));
      this.socket.on('new_chat', (data) => this.appendMessage(data)); // 폴백 지원
      this.socket.on('garden_chat_error', (data) => {
        if (window.showToast) window.showToast(data.message);
      });
    }
  }

  sendMessage() {
    if (!this.input) return;
    const msg = this.input.value.trim();
    if (!msg) return;

    const now = Date.now();
    if (now - this.lastSentTime < this.chatCooldownMs) {
      const waitSec = Math.ceil((this.chatCooldownMs - (now - this.lastSentTime)) / 1000);
      if (window.showToast) {
        window.showToast(`채팅은 ${waitSec}초 후에 다시 전송할 수 있습니다.`);
      }
      return;
    }

    this.lastSentTime = now;
    this.socket.emit('send_garden_chat', {
      sender: this.nickname,
      message: msg
    });

    this.input.value = '';
    this.input.focus();
  }

  appendMessage(data) {
    if (!this.messagesContainer || !data) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';

    if (data.isSystem) {
      msgEl.className = 'chat-msg chat-sys';
      msgEl.textContent = data.message;
    } else {
      const senderSpan = document.createElement('span');
      senderSpan.className = 'chat-sender';
      senderSpan.textContent = data.sender || '정원사';

      const bodySpan = document.createElement('span');
      bodySpan.className = 'chat-body';
      bodySpan.textContent = data.message;

      msgEl.appendChild(senderSpan);
      msgEl.appendChild(bodySpan);
    }

    this.messagesContainer.appendChild(msgEl);

    // FIFO DOM 개수 유지
    while (this.messagesContainer.children.length > this.maxMessages) {
      this.messagesContainer.removeChild(this.messagesContainer.firstChild);
    }

    this.scrollToBottom();

    // 채팅창이 닫혀 있을 때 미확인 알림 뱃지 활성화
    if (!this.isOpen() && this.unreadBadge) {
      this.unreadBadge.style.display = 'block';
    }
  }

  loadRecentChats(chats) {
    if (!Array.isArray(chats) || !this.messagesContainer) return;
    this.messagesContainer.innerHTML = '';
    chats.forEach((chat) => this.appendMessage(chat));
  }
}

window.GardenChatManager = GardenChatManager;
