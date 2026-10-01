import * as vscode from "vscode";

type SupportedLanguage = "sql" | "r";

interface FencedCodeBlock {
  language: SupportedLanguage;
  code: string;
  startLine: number;
  endLine: number;
}

interface RunCodeBlockArgs {
  uri?: string;
  line?: number;
}

export function activate(context: vscode.ExtensionContext): void {
  const runCommand = vscode.commands.registerCommand("markdownRunner.runCodeBlock", async (args?: RunCodeBlockArgs) => {
    await runCurrentCodeBlock(args);
  });

  const codeLensProvider = new MarkdownCodeLensProvider();
  const codeLensRegistration = vscode.languages.registerCodeLensProvider(
    { language: "markdown" },
    codeLensProvider
  );

  context.subscriptions.push(runCommand, codeLensRegistration);
}

export function deactivate(): void {
  // Nothing to dispose explicitly.
}

async function runCurrentCodeBlock(args?: RunCodeBlockArgs): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showWarningMessage("Markdownファイル上で実行してください。");
    return;
  }

  let document = activeEditor.document;
  let line = activeEditor.selection.active.line;

  if (typeof args?.uri === "string" && typeof args?.line === "number") {
    const targetUri = vscode.Uri.parse(args.uri);
    if (targetUri.toString() === document.uri.toString()) {
      line = args.line;
    } else {
      document = await vscode.workspace.openTextDocument(targetUri);
      line = args.line;
    }
  }

  if (document.languageId !== "markdown") {
    vscode.window.showWarningMessage("Markdownファイル上で実行してください。");
    return;
  }

  const block = findCodeBlockAtSelection(document, line);
  if (!block) {
    vscode.window.showInformationMessage("カーソル位置にSQL/Rコードブロックが見つかりません。");
    return;
  }

  if (block.language === "sql") {
    await runSqlBlock(block);
    return;
  }

  await runRBlock(block);
}

function findCodeBlockAtSelection(document: vscode.TextDocument, lineNumber: number): FencedCodeBlock | undefined {
  const lineCount = document.lineCount;

  let startLine = -1;
  let language: SupportedLanguage | undefined;

  for (let i = lineNumber; i >= 0; i -= 1) {
    const lineText = document.lineAt(i).text.trim();
    const match = lineText.match(/^```\s*([a-zA-Z0-9_-]+)\s*$/);
    if (match) {
      const lang = normalizeLanguage(match[1]);
      if (!lang) {
        return undefined;
      }

      startLine = i;
      language = lang;
      break;
    }

    if (lineText === "```") {
      break;
    }
  }

  if (startLine < 0 || !language) {
    return undefined;
  }

  let endLine = -1;
  for (let i = startLine + 1; i < lineCount; i += 1) {
    if (document.lineAt(i).text.trim() === "```") {
      endLine = i;
      break;
    }
  }

  if (endLine < 0) {
    return undefined;
  }

  const lines: string[] = [];
  for (let i = startLine + 1; i < endLine; i += 1) {
    lines.push(document.lineAt(i).text);
  }

  return {
    language,
    code: lines.join("\n").trim(),
    startLine,
    endLine
  };
}

function normalizeLanguage(languageRaw: string): SupportedLanguage | undefined {
  const lang = languageRaw.trim();

  if (/^sql$/i.test(lang)) {
    return "sql";
  }

  if (/^r$/i.test(lang)) {
    return "r";
  }

  return undefined;
}

async function runSqlBlock(block: FencedCodeBlock): Promise<void> {
  if (!block.code) {
    vscode.window.showWarningMessage("SQLコードブロックが空です。");
    return;
  }

  const fullSql = block.code;
  const firstStatement = extractFirstSqlStatement(fullSql);

  const allCommands = await vscode.commands.getCommands(true);

  const fullSuccess = await tryExecuteSqlWithDatabaseClient(fullSql, allCommands);
  if (fullSuccess) {
    vscode.window.showInformationMessage("SQLコードブロックを実行しました。");
    return;
  }

  if (firstStatement !== fullSql) {
    const firstSuccess = await tryExecuteSqlWithDatabaseClient(firstStatement, allCommands);
    if (firstSuccess) {
      vscode.window.showWarningMessage("先頭SQLステートメントのみ実行しました。");
      return;
    }
  }

  vscode.window.showErrorMessage(
    "SQL実行に失敗しました。Database Client 側で接続がアクティブか、SQL実行コマンドが利用可能か確認してください。"
  );
}

function extractFirstSqlStatement(sql: string): string {
  const text = sql.trim();
  if (!text) {
    return text;
  }

  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "";

    if (ch === "'" && prev !== "\\" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && prev !== "\\" && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === ";" && !inSingle && !inDouble) {
      return text.slice(0, i + 1).trim();
    }
  }

  return text;
}

async function tryExecuteSqlWithDatabaseClient(sql: string, allCommands: string[]): Promise<boolean> {
  const directCommands = ["mysql.codeLens.run", "mysql.runQuery"];
  const editorCommands = ["mysql.runSQL", "mysql.runAllQuery"];

  for (const command of directCommands) {
    if (!allCommands.includes(command)) {
      continue;
    }

    try {
      await vscode.commands.executeCommand(command, sql);
      return true;
    } catch {
      // Try next command/fallback.
    }
  }

  for (const command of editorCommands) {
    if (!allCommands.includes(command)) {
      continue;
    }

    const success = await tryExecuteViaTempSqlEditor(command, sql);
    if (success) {
      return true;
    }
  }

  return false;
}

async function tryExecuteViaTempSqlEditor(command: string, sql: string): Promise<boolean> {
  const previousEditor = vscode.window.activeTextEditor;

  try {
    const document = await vscode.workspace.openTextDocument({ language: "sql", content: sql });
    const editor = await vscode.window.showTextDocument(document, { preview: true, preserveFocus: false });

    // Ensure command variants that run selection/current statement can execute the full block.
    const start = new vscode.Position(0, 0);
    const end = document.lineAt(Math.max(document.lineCount - 1, 0)).range.end;
    editor.selection = new vscode.Selection(start, end);

    await vscode.commands.executeCommand(command);
    return true;
  } catch {
    return false;
  } finally {
    if (previousEditor) {
      await vscode.window.showTextDocument(previousEditor.document, previousEditor.viewColumn, true);
      previousEditor.selection = previousEditor.selection;
    }
  }
}

async function runRBlock(block: FencedCodeBlock): Promise<void> {
  if (!block.code) {
    vscode.window.showWarningMessage("Rコードブロックが空です。");
    return;
  }

  const terminal = getExistingRTerminal();
  if (!terminal) {
    const action = await vscode.window.showWarningMessage(
      "Rターミナルが見つかりません。先にRターミナルを起動してから再実行してください。",
      "ターミナルを表示"
    );
    if (action) {
      await vscode.commands.executeCommand("workbench.action.terminal.focus");
    }
    return;
  }

  terminal.show(true);
  terminal.sendText(block.code, true);
  vscode.window.showInformationMessage("Rコードブロックをターミナルで実行しました。");
}

function getExistingRTerminal(): vscode.Terminal | undefined {
  const config = vscode.workspace.getConfiguration("markdownRunner");
  const patternRaw = config.get<string>("rTerminalNamePattern", "^(R ?|Rterm)");

  let matcher: RegExp;
  try {
    matcher = new RegExp(patternRaw, "i");
  } catch {
    matcher = /^(R|Rterm)/i;
  }

  return vscode.window.terminals.find((terminal) => matcher.test(terminal.name));
}

class MarkdownCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== "markdown") {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];

    for (let i = 0; i < document.lineCount; i += 1) {
      const line = document.lineAt(i).text.trim();
      const match = line.match(/^```\s*([a-zA-Z0-9_-]+)\s*$/);
      if (!match) {
        continue;
      }

      const lang = normalizeLanguage(match[1]);
      if (!lang) {
        continue;
      }

      const range = new vscode.Range(i, 0, i, line.length);
      lenses.push(
        new vscode.CodeLens(range, {
          title: "Run Code Block",
          command: "markdownRunner.runCodeBlock",
          arguments: [
            {
              uri: document.uri.toString(),
              line: i + 1
            } as RunCodeBlockArgs
          ]
        })
      );
    }

    return lenses;
  }
}
