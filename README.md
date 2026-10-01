# Markdown Runner

Markdownファイル内のSQL/Rコードブロックを、その場で実行するVS Code拡張です。

## 機能

- Markdown上のカーソル位置にあるコードブロックを実行
- 対応言語
  - SQL
  - R
- コードブロック指定は以下のフェンス記法をサポート
  - ```SQL
  - ```R
- CodeLensで実行ボタンを表示
- エディタ右クリックメニューから実行

## 実行仕様

### SQL

- Database Client の実行コマンドをドライバ非依存で検出して実行します
- まず `mysql.codeLens.run` / `mysql.runQuery` を試行します
- 失敗時は一時的な `.sql` エディタを開き、`mysql.runSQL` / `mysql.runAllQuery` の実行にフォールバックします
- active connection は Database Client 側で設定済みである前提です
- まずコードブロック全体を実行し、失敗した場合は先頭のステートメントのみを実行します
- フェンスは `SQL`（大文字）で記載できます

### R

- 既存のRターミナル（名前で判定）を再利用
- 見つからない場合は実行せず、Rターミナルの起動を勧告します
- コードブロック全体を `sendText(..., true)` で送信
- フェンスは `R`（大文字）で記載できます

## コマンド

- `Markdown Runner: Run Current Code Block`

## 設定

- `markdownRunner.rTerminalNamePattern`: 既存Rターミナル判定用の正規表現

## 開発

```bash
npm install
npm run compile
```

F5 でExtension Development Hostを起動できます。

## TEST

### シンタックスを実行

```SQL
SELECT 20 AS NumericVarle;
```

```R
print("Hello world")
```

```C
/* Code block unsupported */
```