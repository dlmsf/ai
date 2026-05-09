class ChatView {
  static Html() {
    return String.raw`
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EasyAI</title>
    <style>
        body, html {
            height: 100%;
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f4f4f4;
        }
        .container {
            display: flex;
            height: 100%;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            background: #fff;
            overflow: hidden;
        }
        .chat-list {
            width: 15%;
            background: #e9e9e9;
            overflow-y: auto;
            padding: 10px;
            position: relative;
        }
        .reset-button {
            position: absolute;
            top: 10px;
            right: 10px;
            background-color: #d32f2f;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 5px;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: background-color 0.3s, box-shadow 0.3s;
        }
        .reset-button:hover {
            background-color: #b71c1c;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        .chat-box {
            flex-grow: 1;
            padding: 20px;
            position: relative;
            display: flex;
            flex-direction: column;
        }
        #chat-messages {
            overflow-y: auto;
            flex-grow: 1;
        }
        .message-input {
            width: 100%;
            padding: 10px;
            background: #fff;
            display: flex;
            align-items: center;
            border-top: 2px solid #ddd;
        }
        .message-input textarea {
            flex-grow: 1;
            padding: 10px;
            margin-right: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
            resize: none;
            min-height: 40px;
        }
        .message-input button {
            padding: 10px 20px;
            background-color: #0078d7;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        .message-input button:hover {
            background-color: #005a9e;
        }
        .message {
            padding: 10px;
            margin: 10px 0;
            border-radius: 10px;
            background: #e7e7e7;
            white-space: pre-wrap;
        }
        .user-message {
            background: #0078d7;
            color: #fff;
            text-align: right;
        }
        .ai-message {
            background: #58a700;
            color: #fff;
        }
        .code-block {
            position: relative;
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 15px;
            padding-top: 35px;
            margin: 10px 0;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            white-space: pre-wrap;
            overflow-x: auto;
            border: 1px solid #333;
        }
        .code-language-label {
            position: absolute;
            top: 5px;
            left: 10px;
            color: #888;
            font-size: 11px;
            font-family: Arial, sans-serif;
            text-transform: uppercase;
        }
        .copy-button {
            position: absolute;
            top: 5px;
            right: 5px;
            background: #0078d7;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.3s;
            z-index: 10;
        }
        .copy-button:hover {
            background: #005a9e;
        }
        .copy-button.copied {
            background: #58a700;
        }
        @media (max-width: 768px) {
            .container {
                flex-direction: column;
            }
            .chat-list {
                width: 100%;
                height: 150px;
                overflow-y: auto;
            }
            .chat-box {
                height: calc(100% - 150px);
            }
            .message-input {
                position: relative;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="chat-list">
            <h2>Sessions</h2>
            <!-- Sessions will be added here -->
        </div>
        <div class="chat-box">
            <button class="reset-button" onclick="resetChat()">Reset</button>
            <h2>Chat</h2>
            <div id="chat-messages" style="margin-bottom: 60px;">
                <!-- Messages will be displayed here -->
            </div>
            <div class="message-input">
                <textarea id="message-input" placeholder="Type a message..." onkeydown="handleInput(event)"></textarea>
                <button onclick="sendMessage()">Send</button>
            </div>
        </div>
    </div>

    <script>
        let eventSource = null;
        let aiMessageDiv = null;
        let isGenerating = false;
        let isAutoScrollLocked = true;
        let aiFullContent = '';
        
        // Auto-scroll lock mechanism
        const chatMessages = document.getElementById('chat-messages');
        
        chatMessages.addEventListener('scroll', function() {
            const scrollBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
            const isAtBottom = scrollBottom < 30;
            
            if (isGenerating) {
                if (isAtBottom && !isAutoScrollLocked) {
                    isAutoScrollLocked = true;
                } else if (!isAtBottom && isAutoScrollLocked) {
                    isAutoScrollLocked = false;
                }
            }
        });
        
        function scrollToBottom() {
            requestAnimationFrame(function() {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            });
        }
        
        function detectAndFormatCode(text) {
            const fragments = [];
            let currentIndex = 0;
            const backtick3 = '\x60\x60\x60';
            
            while (currentIndex < text.length) {
                const codeBlockStart = text.indexOf(backtick3, currentIndex);
                
                if (codeBlockStart === -1) {
                    if (currentIndex < text.length) {
                        fragments.push({
                            type: 'text',
                            content: text.substring(currentIndex)
                        });
                    }
                    break;
                }
                
                if (codeBlockStart > currentIndex) {
                    fragments.push({
                        type: 'text',
                        content: text.substring(currentIndex, codeBlockStart)
                    });
                }
                
                const lineEnd = text.indexOf('\n', codeBlockStart);
                let language = '';
                let codeStartIndex;
                
                if (lineEnd !== -1) {
                    const possibleLang = text.substring(codeBlockStart + 3, lineEnd).trim();
                    if (/^[a-zA-Z0-9#\-\+_.]*$/.test(possibleLang) && possibleLang.length < 30) {
                        language = possibleLang;
                        codeStartIndex = lineEnd + 1;
                    } else {
                        codeStartIndex = codeBlockStart + 3;
                        if (text[codeStartIndex] === '\n') {
                            codeStartIndex++;
                        }
                    }
                } else {
                    codeStartIndex = codeBlockStart + 3;
                }
                
                const codeBlockEnd = text.indexOf(backtick3, codeStartIndex);
                
                if (codeBlockEnd === -1) {
                    fragments.push({
                        type: 'text',
                        content: text.substring(codeBlockStart)
                    });
                    break;
                }
                
                let codeContent = text.substring(codeStartIndex, codeBlockEnd);
                
                if (codeContent.endsWith('\n')) {
                    codeContent = codeContent.slice(0, -1);
                }
                
                fragments.push({
                    type: 'code',
                    language: language || 'code',
                    content: codeContent
                });
                
                currentIndex = codeBlockEnd + 3;
                
                if (currentIndex < text.length && text[currentIndex] === '\n') {
                    currentIndex++;
                }
            }
            
            return fragments.length > 0 ? fragments : [{ type: 'text', content: text }];
        }
        
        function renderMessageContent(messageDiv, content) {
            messageDiv.innerHTML = '';
            
            const fragments = detectAndFormatCode(content);
            
            fragments.forEach(function(fragment) {
                if (fragment.type === 'code') {
                    const codeBlock = document.createElement('div');
                    codeBlock.className = 'code-block';
                    
                    if (fragment.language) {
                        const langLabel = document.createElement('div');
                        langLabel.className = 'code-language-label';
                        langLabel.textContent = fragment.language;
                        codeBlock.appendChild(langLabel);
                    }
                    
                    const copyButton = document.createElement('button');
                    copyButton.className = 'copy-button';
                    copyButton.textContent = 'Copy';
                    copyButton.onclick = function() {
                        navigator.clipboard.writeText(fragment.content).then(function() {
                            copyButton.textContent = 'Copied!';
                            copyButton.classList.add('copied');
                            setTimeout(function() {
                                copyButton.textContent = 'Copy';
                                copyButton.classList.remove('copied');
                            }, 2000);
                        });
                    };
                    
                    const codeContent = document.createTextNode(fragment.content);
                    codeBlock.appendChild(copyButton);
                    codeBlock.appendChild(codeContent);
                    messageDiv.appendChild(codeBlock);
                } else {
                    const textNode = document.createTextNode(fragment.content);
                    messageDiv.appendChild(textNode);
                }
            });
        }
        
        function sendMessage() {
          if (isGenerating) return;
          
          const input = document.getElementById('message-input');
          const message = input.value.trim();
          if (!message) return;
          
          appendMessage(message, 'user');
          input.value = '';
          input.disabled = true;
          isGenerating = true;
          isAutoScrollLocked = true;
          aiFullContent = '';
          
          if (eventSource) {
            eventSource.close();
          }
          
          fetch('/message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message })
          })
          .then(function(response) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            function processStream(result) {
              if (result.done) {
                isGenerating = false;
                input.disabled = false;
                input.focus();
                aiMessageDiv = null;
                aiFullContent = '';
                if (isAutoScrollLocked) {
                    scrollToBottom();
                }
                return;
              }
              
              const chunk = decoder.decode(result.value, { stream: true });
              const lines = chunk.split('\n\n');
              
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('data: ')) {
                  const data = line.substring(6);
                  
                  if (data === '[DONE]') {
                    isGenerating = false;
                    input.disabled = false;
                    input.focus();
                    aiMessageDiv = null;
                    aiFullContent = '';
                    if (isAutoScrollLocked) {
                        scrollToBottom();
                    }
                    return;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.content) {
                      const contentWithLineBreaks = parsed.content.replace(/\\n/g, '\n');
                      aiFullContent += contentWithLineBreaks;
                      
                      if (aiMessageDiv) {
                        renderMessageContent(aiMessageDiv, aiFullContent);
                      } else {
                        aiMessageDiv = document.createElement('div');
                        aiMessageDiv.classList.add('message', 'ai-message');
                        chatMessages.appendChild(aiMessageDiv);
                        renderMessageContent(aiMessageDiv, aiFullContent);
                      }
                      
                      if (isAutoScrollLocked) {
                        scrollToBottom();
                      }
                    }
                  } catch (e) {
                    console.error('Error parsing JSON:', e, 'Data:', data);
                  }
                }
              }
              
              return reader.read().then(processStream);
            }
            
            return reader.read().then(processStream);
          })
          .catch(function(error) {
            console.error('Error:', error);
            isGenerating = false;
            input.disabled = false;
            input.focus();
          });
        }
        
        function resetChat() {
          fetch('/reset', { method: 'POST' });
          document.getElementById('chat-messages').innerHTML = '';
          aiMessageDiv = null;
          aiFullContent = '';
          isAutoScrollLocked = true;
        }
        
        function appendMessage(text, sender) {
          const chatMessages = document.getElementById('chat-messages');
          if (sender === 'user') {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message', 'user-message');
            msgDiv.textContent = text;
            chatMessages.appendChild(msgDiv);
            scrollToBottom();
          }
        }
        
        function handleInput(event) {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
          }
        }
        
        window.onload = function() {
          const input = document.getElementById('message-input');
          input.addEventListener('keydown', handleInput);
          input.focus();
        };
    </script>
        
</body>
</html>
    `;
  }
}

export default ChatView;