// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// 定义配置接口
interface WeChatConfig {
	appid: string;
	appSecret: string;
	author?: string;
	digest?: string;
}

// 定义 API 响应接口
interface ApiResponse {
	success: boolean;
	data?: {
		media_id: string;
		created_at: number;
		title: string;
		content_preview: string;
	};
	message?: string;
	error?: string;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Markdown2Weixin 扩展已激活');

	// 注册上传到微信公众号的命令
	const disposable = vscode.commands.registerCommand('markdown2weixin.uploadToWeChat', async () => {
		await uploadToWeChat();
	});

	context.subscriptions.push(disposable);
}

// 上传到微信公众号的主函数
async function uploadToWeChat() {
	try {
		// 1. 获取配置
		const config = getConfiguration();
		if (!config) {
			return; // 配置验证失败，已显示错误信息
		}

		// 2. 获取当前编辑器和文档
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('请先打开一个 Markdown 文件');
			return;
		}

		// 3. 检查是否为 Markdown 文件
		if (editor.document.languageId !== 'markdown') {
			vscode.window.showErrorMessage('当前文件不是 Markdown 文件');
			return;
		}

		// 4. 获取文档内容
		const markdown = editor.document.getText();
		if (!markdown.trim()) {
			vscode.window.showErrorMessage('文档内容为空，无法上传');
			return;
		}

		// 5. 提取标题
		const title = extractTitle(editor.document);
		if (!title) {
			vscode.window.showErrorMessage('无法提取文章标题，请确保文档包含标题或有效文件名');
			return;
		}

		// 6. 显示进度并上传
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: '正在上传到微信公众号...',
				cancellable: false
			},
			async (progress) => {
				progress.report({ increment: 0, message: '准备上传...' });

				try {
					// 调用 API
					const result = await callWeChatApi(markdown, title, config);
					
					progress.report({ increment: 100, message: '上传完成' });

					// 显示成功消息
					if (result.success && result.data) {
						const action = await vscode.window.showInformationMessage(
							`✅ 上传成功！\n标题：${result.data.title}\nMedia ID：${result.data.media_id}`,
							'复制 Media ID',
							'关闭'
						);

						if (action === '复制 Media ID') {
							await vscode.env.clipboard.writeText(result.data.media_id);
							vscode.window.showInformationMessage('Media ID 已复制到剪贴板');
						}
					} else {
						vscode.window.showInformationMessage(
							result.message || '上传成功！'
						);
					}
				} catch (error) {
					throw error;
				}
			}
		);
	} catch (error) {
		// 错误处理
		const errorMessage = error instanceof Error ? error.message : '未知错误';
		vscode.window.showErrorMessage(`❌ 上传失败：${errorMessage}`);
		console.error('上传错误：', error);
	}
}

// 获取和验证配置
function getConfiguration(): WeChatConfig | null {
	const config = vscode.workspace.getConfiguration('markdown2weixin');
	
	const appid = config.get<string>('appid', '').trim();
	const appSecret = config.get<string>('appSecret', '').trim();
	const author = config.get<string>('author', '').trim();
	const digest = config.get<string>('digest', '').trim();

	// 验证必填项
	if (!appid || !appSecret) {
		vscode.window.showErrorMessage(
			'请先在设置中配置微信公众号的 AppID 和 AppSecret',
			'打开设置'
		).then(action => {
			if (action === '打开设置') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'markdown2weixin');
			}
		});
		return null;
	}

	return {
		appid,
		appSecret,
		author: author || undefined,
		digest: digest || undefined
	};
}

// 提取文章标题
function extractTitle(document: vscode.TextDocument): string | null {
	const text = document.getText();
	
	// 尝试从文档中提取第一个 # 标题
	const titleMatch = text.match(/^#\s+(.+)$/m);
	if (titleMatch && titleMatch[1]) {
		return titleMatch[1].trim();
	}

	// 如果没有找到标题，使用文件名（去掉扩展名）
	const fileName = document.fileName;
	const fileNameMatch = fileName.match(/([^/\\]+)\.md$/i);
	if (fileNameMatch && fileNameMatch[1]) {
		return fileNameMatch[1];
	}

	// 如果是未保存的文件
	if (document.isUntitled) {
		return '未命名文档';
	}

	return null;
}

// 调用微信 API
async function callWeChatApi(
	markdown: string,
	title: string,
	config: WeChatConfig
): Promise<ApiResponse> {
	const apiUrl = 'https://www.fastpen.online/api/draft/multi/import-markdown';

	// 构建请求体
	const requestBody: any = {
		markdown,
		title,
		appid: config.appid,
		app_secret: config.appSecret
	};

	// 添加可选参数
	if (config.author) {
		requestBody.author = config.author;
	}
	if (config.digest) {
		requestBody.digest = config.digest;
	}

	// 发送请求
	const response = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(requestBody)
	});

	// 检查 HTTP 状态
	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`HTTP ${response.status}: ${errorText}`);
	}

	// 解析响应
	const result = await response.json() as ApiResponse;

	// 检查业务状态
	if (!result.success) {
		throw new Error(result.error || result.message || '上传失败');
	}

	return result;
}

// This method is called when your extension is deactivated
export function deactivate() {}
