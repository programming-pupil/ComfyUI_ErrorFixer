import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let lastApiError = null;

function setupExecutionErrorListener() {
    api.addEventListener("execution_error", (e) => {
        const errorData = e.detail;
        console.log("🔧 [API] High-quality error event captured:", errorData);
        
        lastApiError = {
            type: 'execution_error',
            nodeId: errorData.node_id,
            nodeType: errorData.node_type,
            message: errorData.exception_message,
            traceback: errorData.traceback,
            timestamp: new Date().toISOString(),
            captureTime: Date.now(),
            workflow: getWorkflowData()
        };
        
        if (errorData.node_id) {
            setTimeout(() => addErrorMarkerToNode(errorData.node_id, lastApiError), 200);
        }
    });
}

function observeErrorDialogs() {
    console.log("🔧 Starting to observe error dialogs...");
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    checkForErrorDialog(node);
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // 也检查已存在的元素
    setTimeout(() => {
        const existingDialogs = document.querySelectorAll('div, [class*="modal"], [class*="dialog"], [class*="popup"]');
        existingDialogs.forEach(checkForErrorDialog);
    }, 1000);
}

function checkForErrorDialog(element) {
    try {
        // 避免在自己的按钮上触发
        if (element.closest('.error-fixer-button-container') || element.classList.contains('error-fixer-button')) {
            return;
        }

        const textContent = element.textContent || element.innerText || '';
        
        // 多种错误模式检测（参考工作版本）
        const errorPatterns = [
            /error/i,
            /exception/i,
            /failed/i,
            /object has no attribute/i,
            /nonetype/i,
            /traceback/i,
            /invalid/i,
            /cannot/i,
            /unable/i,
            /错误/i,
            /失败/i
        ];
        
        const hasErrorText = errorPatterns.some(pattern => pattern.test(textContent));
        
        // 检查是否是弹窗样式（参考工作版本的判断逻辑）
        const style = window.getComputedStyle(element);
        const isModal = style.position === 'fixed' || style.position === 'absolute';
        const hasHighZIndex = parseInt(style.zIndex) > 100;
        
        if (hasErrorText && (isModal || hasHighZIndex || element.offsetParent === document.body)) {
            console.log("🔧 Found potential error dialog:", element);
            handleErrorDialog(element, textContent);
        }
        
        // 特别检查ComfyUI特定错误
        if (textContent.includes("'NoneType' object has no attribute 'shape'") || 
            textContent.includes("K采样器") ||
            textContent.includes("帮助修复这个")) {
            console.log("🔧 Found ComfyUI specific error dialog:", element);
            handleErrorDialog(element, textContent);
        }
        
    } catch (e) {
        // 忽略检查错误
    }
}

function handleErrorDialog(dialogElement, errorText) {
    try {
        console.log("🔧 Processing error dialog:", errorText.substring(0, 100));
        
        // 防止重复处理
        if (dialogElement.querySelector('.error-fixer-button')) {
            return;
        }

        let errorInfo;
        const now = Date.now();

        if (lastApiError && (now - lastApiError.captureTime) < 3000) {
            console.log("🔧 Using high-quality data from recent API event.");
            errorInfo = lastApiError;
        } else {
            console.log("🔧 API data not found or too old. Falling back to parsing dialog text.");
            
            // 提取错误信息（参考工作版本）
            let errorMessage = errorText.trim();
            let nodeName = '';
            let nodeType = '';
            let nodeId = '';
            
            // 尝试从对话框标题中提取节点信息
            const titleElement = dialogElement.querySelector('h1, h2, h3, .title, [class*="title"]');
            if (titleElement) {
                const titleText = titleElement.textContent || titleElement.innerText;
                if (titleText && titleText !== errorMessage) {
                    nodeName = titleText.trim();
                    nodeType = titleText.trim();
                }
            }
            
            // 从错误信息中提取节点ID
            const nodeIdMatch = errorMessage.match(/node[^\d]*(\d+)/i);
            if (nodeIdMatch) {
                nodeId = nodeIdMatch[1];
            }
            
            errorInfo = {
                type: 'dialog_text_error',
                message: errorMessage,
                nodeName: nodeName,
                nodeType: nodeType,
                nodeId: nodeId,
                timestamp: new Date().toISOString()
            };
        }

        // 添加按钮到对话框
        addFixButtonToDialog(dialogElement, errorInfo);
        
        console.log("🔧 Error processed successfully");
        
    } catch (e) {
        console.error("🔧 Error processing dialog:", e);
    }
}

function addFixButtonToDialog(dialogElement, errorInfo) {
    try {
        const fixButton = createFixButton(errorInfo);
        
        const insertionTargets = [
            dialogElement.querySelector('.buttons'),
            dialogElement.querySelector('.actions'),
            dialogElement.querySelector('.footer'),
            dialogElement.querySelector('button')?.parentNode,
            dialogElement.querySelector('.comfy-manager-dialog-actions'), // ComfyUI-Manager
            dialogElement.querySelector('.dialog_actions'),
            dialogElement.querySelector('.comfy-modal-actions'),
            dialogElement.querySelector('.dialog_content'),
            dialogElement.querySelector('.modal_content'),
            dialogElement // 最终备选
        ];
        
        let buttonAdded = false;
        for (const target of insertionTargets) {
            if (target) {
                console.log("🔧 Adding button to dialog target:", target.className || target.nodeName);
                target.appendChild(fixButton);
                buttonAdded = true;
                break;
            }
        }
        
        if (!buttonAdded) {
            console.log("🔧 Creating new button container");
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'error-fixer-button-container';
            buttonContainer.style.cssText = `
                text-align: center !important;
                padding: 10px !important;
                border-top: 1px solid #333 !important;
                margin-top: 10px !important;
            `;
            buttonContainer.appendChild(fixButton);
            dialogElement.appendChild(buttonContainer);
        }
        
    } catch (e) {
        console.error("🔧 Error adding button to dialog:", e);
    }
}

function createFixButton(errorInfo) {
    const button = document.createElement('button');
    button.className = 'error-fixer-button';
    button.innerHTML = '🔧 Error Fixer Online';
    
    // 使用工作版本的样式
    button.style.cssText = `
        background: #ff6b35 !important;
        color: white !important;
        border: none !important;
        padding: 8px 16px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        margin: 10px 5px !important;
        font-size: 14px !important;
        font-weight: bold !important;
        transition: all 0.3s ease !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        z-index: 10000 !important;
        display: inline-block !important;
    `;
    
    button.addEventListener('mouseenter', () => {
        button.style.background = '#e55a2b';
        button.style.transform = 'translateY(-1px)';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.background = '#ff6b35';
        button.style.transform = 'translateY(0)';
    });
    
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔧 Fix button clicked for error:", errorInfo.message);
        openErrorFixPage(errorInfo);
    });
    
    return button;
}

function openErrorFixPage(errorInfo) {
    const baseUrl = "https://bug.aix.ink";
    const params = new URLSearchParams({
        q: errorInfo.message,
        source: 'comfyui_plugin_final'
    });
    window.open(`${baseUrl}?${params.toString()}`, '_blank');
}

function getWorkflowData() {
    try {
        return app.graph ? JSON.stringify(app.graph.serialize()) : "{}";
    } catch (e) {
        return `{"error": "Unable to capture workflow: ${e.message}"}`;
    }
}

function addErrorMarkerToNode(nodeId, errorInfo) {
    const targetNode = app.graph?.getNodeById(nodeId);
    if (!targetNode) return;

    if (targetNode.hasErrorMarker) {
        targetNode.errorInfo = errorInfo;
        return;
    }
    targetNode.errorInfo = errorInfo;
    const originalOnDrawForeground = targetNode.onDrawForeground;
    targetNode.onDrawForeground = function(ctx) {
        if (originalOnDrawForeground) originalOnDrawForeground.apply(this, arguments);
        if (typeof LiteGraph === "undefined") return;
        const iconSize = 22, margin = 4, titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
        const existingIconsWidth = 38;
        const iconX = this.size[0] - iconSize - margin - existingIconsWidth;
        const iconY = -titleHeight + (titleHeight - iconSize) / 2;
        ctx.save();
        ctx.fillStyle = "#E53E3E";
        ctx.beginPath();
        ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = `bold ${iconSize * 0.65}px Arial`;
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🔧", iconX + iconSize / 2, iconY + iconSize / 2 + 1);
        ctx.restore();
        this.errorIconBounds = { x: iconX, y: iconY, width: iconSize, height: iconSize };
    };
    const originalOnMouseDown = targetNode.onMouseDown;
    targetNode.onMouseDown = function(e, localPos) {
        if (this.errorIconBounds && typeof LiteGraph !== "undefined" && LiteGraph.isInsideRectangle(localPos[0], localPos[1], this.errorIconBounds.x, this.errorIconBounds.y, this.errorIconBounds.width, this.errorIconBounds.height)) {
            openErrorFixPage(this.errorInfo);
            return true; 
        }
        return originalOnMouseDown ? originalOnMouseDown.apply(this, arguments) : false;
    };
    targetNode.hasErrorMarker = true;
    app.canvas?.setDirty(true, true);
}

// 插件注册
app.registerExtension({
    name: "ComfyUI.ErrorFixer.Final",
    async setup() {
        console.log("🔧 Error Fixer Plugin [Final Version] Loaded. Using robust DOM observation.");
        
        setTimeout(() => {
            observeErrorDialogs();
            setupExecutionErrorListener();
            console.log("🔧 Error monitoring started.");
        }, 2000);
    }
});
