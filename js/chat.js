/**
 * Keep the Fire Alive - 실시간 채팅 클라이언트 모듈
 * XSS 공격 방어 (textContent 전용), FIFO DOM 노드 제한(최대 40개), 3초 전송 쿨다운 관리,
 * 완전 닫기/열기 상태 관리 및 새 메시지 알림 뱃지 지원
 */

class CampfireChatManager {
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

    this.nickname = localStorage.getItem('campfire_nickname') || '';
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
    // 모바일이 아닌 경우 자동 포커스
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
      localStorage.setItem('campfire_nickname', nick);
    }
    if (this.nicknameBadge) {
      this.nicknameBadge.textContent = this.nickname;
      this.nicknameBadge.title = `내 닉네임: ${this.nickname} (클릭하여 변경)`;
    }
  }

  initEvents() {
    // 1. 헤더 닫기 버튼 ('✕')
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // 2. 상단 바 채팅 토글 버튼 연동
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    // 3. ESC 키 입력 시 채팅창 닫기 편의 기능
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // 4. 닉네임 클릭 시 변경 대화상자
    if (this.nicknameBadge) {
      this.nicknameBadge.style.cursor = 'pointer';
      this.nicknameBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const newNick = prompt('사용할 닉네임을 입력하세요 (최대 12자):', this.nickname);
        if (newNick && newNick.trim()) {
          this.nickname = newNick.trim().slice(0, 12);
          localStorage.setItem('campfire_nickname', this.nickname);
          this.nicknameBadge.textContent = this.nickname;
        }
      });
    }

    // 5. 메시지 전송 (버튼 클릭 및 Enter 키)
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.sendMessage());
    }

    if (this.input) {
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // 6. 소켓 이벤트 리스너 등록
    this.socket.on('new_chat', (chatItem) => {
      this.appendMessage(chatItem);

      // 채팅창이 닫혀 있을 때 상단 토글 버튼에 알림 인디케이터 표시
      if (!this.isOpen() && this.unreadBadge) {
        this.unreadBadge.style.display = 'inline-block';
      }
    });

    this.socket.on('chat_error', (data) => {
      alert(data.message || '채팅 전송에 실패했습니다.');
    });
  }

  sendMessage() {
    const text = this.input.value.trim();
    if (!text) return;

    const now = Date.now();
    if (now - this.lastSentTime < this.chatCooldownMs) {
      const wait = Math.ceil((this.chatCooldownMs - (now - this.lastSentTime)) / 1000);
      alert(`채팅은 3초에 한 번만 전송할 수 있습니다. (${wait}초 대기)`);
      return;
    }

    this.lastSentTime = now;
    this.socket.emit('send_chat', {
      sender: this.nickname,
      message: text.slice(0, 80)
    });

    this.input.value = '';
  }

  // 안전한 DOM 렌더링 (XSS 원천 차단)
  appendMessage(chatItem) {
    if (!this.messagesContainer) return;

    // FIFO 제한: 최대 개수 초과 시 가장 오래된 메시지 제거
    while (this.messagesContainer.children.length >= this.maxMessages) {
      this.messagesContainer.removeChild(this.messagesContainer.firstChild);
    }

    const itemEl = document.createElement('div');
    itemEl.className = 'chat-item';
    if (chatItem.isSystem) itemEl.classList.add('system');

    if (chatItem.isSystem) {
      itemEl.textContent = chatItem.message;
    } else {
      const senderEl = document.createElement('span');
      senderEl.className = 'chat-sender';
      senderEl.textContent = `[${chatItem.sender}]:`;

      const textEl = document.createElement('span');
      textEl.className = 'chat-text';
      textEl.textContent = chatItem.message;

      itemEl.appendChild(senderEl);
      itemEl.appendChild(textEl);
    }

    this.messagesContainer.appendChild(itemEl);
    this.scrollToBottom();

    // 25초 후 은은한 반투명 페이드아웃 (시야 방해 최소화)
    setTimeout(() => {
      itemEl.style.opacity = '0.45';
    }, 25000);
  }

  // 초기 최근 채팅 일괄 로드
  loadRecentChats(chats) {
    if (!this.messagesContainer || !Array.isArray(chats)) return;
    this.messagesContainer.innerHTML = '';
    chats.forEach((c) => this.appendMessage(c));
  }
}

window.CampfireChatManager = CampfireChatManager;
