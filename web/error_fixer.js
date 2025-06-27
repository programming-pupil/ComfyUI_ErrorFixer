import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// 全局变量，存储最后一次API错误
let lastApiError = null;

function setupExecutionErrorListener() {
    api.addEventListener("execution_error", (e) => {
        const errorData = e.detail;
        console.log("🔧 [API] High-quality error event captured:", errorData);
        lastApiError = {
            ...errorData,
            type: 'execution_error',
            captureTime: Date.now(),
            workflow: getWorkflowData()
        };
        if (errorData.node_id) {
            setTimeout(() => addErrorMarkerToNode(errorData.node_id, lastApiError), 100);
        }
    });
}

function observeForAnchor() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    inspectForAnchorAndInject(node);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
    console.log("🔧 Header Injector is now active. Looking for 'Show Report' button...");
}

function inspectForAnchorAndInject(element) {
    const anchorButton = findReportButton(element);

    if (anchorButton) {
        const dialogContainer = anchorButton.closest('.litemodal-dialog, .comfy-modal, [role="dialog"]');
        if (!dialogContainer) {
            console.warn("🔧 Found anchor, but couldn't find a parent dialog container.");
            return;
        }

        const closeButton = dialogContainer.querySelector('button.close, a.close, [aria-label="Close"], [aria-label="关闭"], .litemodal-close');
        
        if (closeButton) {
            const headerContainer = closeButton.parentNode;
            handleHeaderInjection(headerContainer, dialogContainer); // 传入整个弹窗容器
        } else {
             console.warn("🔧 Found dialog, but couldn't find a close button to anchor to the header.");
        }
    }
}

function handleHeaderInjection(headerContainer, dialogContainer) {
    if (headerContainer.querySelector('.error-fixer-button')) {
        return;
    }

    let errorInfo = getLatestErrorInfo(dialogContainer);
    
    const fixButton = createFixButton(errorInfo);
    headerContainer.insertBefore(fixButton, headerContainer.querySelector('button.close, a.close, [aria-label="Close"], [aria-label="关闭"], .litemodal-close'));
    console.log("🔧 Injected button into the dialog header.");
}

function findReportButton(element) {
    const selector = 'button, a';
    const elements = element.matches(selector) ? [element] : element.querySelectorAll(selector);
    for (const el of elements) {
        const text = el.textContent.trim();
        if (text === "显示报告" || text === "Show Report") {
            return el;
        }
    }
    return null;
}

/**
 * 获取最新的错误信息（优先API，其次解析净化后的弹窗文本）
 * @param {HTMLElement} dialogContainer 
 * @returns {object}
 */
function getLatestErrorInfo(dialogContainer) {
    const now = Date.now();
    if (lastApiError && (now - lastApiError.captureTime) < 5000) {
        console.log("🔧 Using high-quality data from recent API event.");
        return lastApiError;
    } else {
        console.log("🔧 Falling back to parsing dialog text.");
        
        const cleanedMessage = getCleanedErrorMessage(dialogContainer);

        return {
            type: 'dialog_text_error',
            message: cleanedMessage, // 使用净化后的消息
            nodeType: 'Unknown',
            traceback: 'N/A',
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * 克隆弹窗，移除不必要的UI元素，然后返回纯净的错误文本。
 * @param {HTMLElement} dialogContainer 
 * @returns {string}
 */
function getCleanedErrorMessage(dialogContainer) {
    try {
        // 1. 克隆节点，避免修改用户正在看的界面
        const clone = dialogContainer.cloneNode(true);

        // 2. 定义要移除的UI元素的选择器列表
        const SELECTORS_TO_REMOVE = [
            // 移除整个头部（包含标题"提示执行失败"和关闭按钮）
            '.litemodal-header', 
            '.p-dialog-header',
            // 移除整个底部/操作区（包含"显示报告"和"帮助修复这个"按钮）
            '.litemodal-buttons',
            '.p-dialog-footer',
            '.flex.gap-2.justify-center', // 你提供的HTML结构中的按钮容器
            // 移除我们自己注入的按钮，以防万一
            '.error-fixer-button'
        ];

        // 3. 在克隆节点上执行移除操作
        SELECTORS_TO_REMOVE.forEach(selector => {
            const elementToRemove = clone.querySelector(selector);
            if (elementToRemove) {
                elementToRemove.remove();
            }
        });

        // 4. 从净化后的克隆中提取文本
        let cleanedText = clone.textContent || "";

        // 5. 做最后的文本清理，去除多余的换行和空格
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

        cleanedText = cleanedText.replace('查找问题', ' ').trim();
        cleanedText = cleanedText.replace('提示执行失败', ' ').trim();

        console.log("🔧 Cleaned error message:", cleanedText.substring(0, 150) + "...");
        return cleanedText.substring(0, 2000); // 限制长度

    } catch (e) {
        console.error("🔧 Error while cleaning message:", e);
        // 如果净化失败，返回原始文本作为备用
        return (dialogContainer.textContent || "").trim().substring(0, 2000);
    }
}


/**
 * 创建按钮
 * @param {object} errorInfo 
 * @returns {HTMLElement}
 */
function createFixButton(errorInfo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'error-fixer-button';
    button.innerHTML = '🔧 Error Fixer Online';
    
    Object.assign(button.style, {
        background: '#ff6b35',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: '8px', // 圆角
        cursor: 'pointer',
        margin: '0 10px 0 0', // 和关闭按钮之间留出间距
        fontSize: '14px',
        fontWeight: 'bold',
        display: 'inline-flex', // 让图标和文字对齐
        alignItems: 'center',
        gap: '6px', // 图标和文字的间距
        lineHeight: '1',
    });
    
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openErrorFixPage(errorInfo);
    });
    
    return button;
}

function openErrorFixPage(errorInfo) {
    console.log('errorInfo:' , errorInfo)
    const baseUrl = "https://bug.aix.ink";
    const params = new URLSearchParams({
        q: errorInfo.message || errorInfo.exception_message || 'N/A'
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
    name: "ComfyUI.ErrorFixer.HeaderInjectV6",
    async setup() {
        console.log("🔧 Error Fixer Plugin [V6 Header Inject] Loaded. Final version.");
        setTimeout(() => {
            setupExecutionErrorListener();
            observeForAnchor();
            console.log("🔧 Error monitoring system is fully initialized.");
        }, 1000);
    }
});
