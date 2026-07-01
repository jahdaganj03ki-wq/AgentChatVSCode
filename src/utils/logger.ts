import * as vscode from 'vscode';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private static outputChannel: vscode.OutputChannel;
  private static level: LogLevel = 'info';

  static initialize() {
    this.outputChannel = vscode.window.createOutputChannel('ApexAgent', 'apexagent-logs');
    this.updateLevel();
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('apexagent.logLevel')) {
        this.updateLevel();
      }
    });
  }

  private static updateLevel() {
    const config = vscode.workspace.getConfiguration('apexagent');
    this.level = config.get<LogLevel>('logLevel', 'info');
  }

  static debug(context: string, message: string) {
    this.log('debug', context, message);
  }

  static info(context: string, message: string) {
    this.log('info', context, message);
  }

  static warn(context: string, message: string) {
    this.log('warn', context, message);
  }

  static error(context: string, message: string) {
    this.log('error', context, message);
  }

  private static log(level: LogLevel, context: string, message: string) {
    if (LEVEL_VALUES[level] < LEVEL_VALUES[this.level]) return;
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    const prefix = level.toUpperCase().padEnd(5);
    this.outputChannel.appendLine(`[${prefix}] [${context}] ${timestamp} ${message}`);
  }

  static getChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }

  static dispose() {
    this.outputChannel?.dispose();
  }
}
