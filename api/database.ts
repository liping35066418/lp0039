import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'

const dataDir = join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })
mkdirSync(join(dataDir, 'logs'), { recursive: true })
mkdirSync(join(dataDir, 'temp'), { recursive: true })

const db = new Database(join(dataDir, 'speed-radar.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS test_report (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    score REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    summary TEXT NOT NULL DEFAULT '{}',
    details TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS speed_sample (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reportId TEXT NOT NULL,
    type TEXT NOT NULL,
    value REAL NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (reportId) REFERENCES test_report(id)
);
CREATE TABLE IF NOT EXISTS performance_resource (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reportId TEXT NOT NULL,
    name TEXT NOT NULL,
    resourceType TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    status INTEGER NOT NULL DEFAULT 200,
    abnormal INTEGER NOT NULL DEFAULT 0,
    abnormalReason TEXT,
    FOREIGN KEY (reportId) REFERENCES test_report(id)
);
CREATE TABLE IF NOT EXISTS script_metric (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reportId TEXT NOT NULL,
    name TEXT NOT NULL,
    parseTime REAL NOT NULL DEFAULT 0,
    compileTime REAL NOT NULL DEFAULT 0,
    executionTime REAL NOT NULL DEFAULT 0,
    isLongTask INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (reportId) REFERENCES test_report(id)
);
CREATE TABLE IF NOT EXISTS monitor_task (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    duration INTEGER NOT NULL,
    interval INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    progress REAL NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    startedAt TEXT,
    completedAt TEXT,
    config TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS monitor_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId TEXT NOT NULL,
    latency REAL,
    downloadSpeed REAL,
    uploadSpeed REAL,
    packetLoss REAL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (taskId) REFERENCES monitor_task(id)
);
CREATE INDEX IF NOT EXISTS idx_report_type ON test_report(type);
CREATE INDEX IF NOT EXISTS idx_report_created ON test_report(createdAt);
CREATE INDEX IF NOT EXISTS idx_sample_report ON speed_sample(reportId);
CREATE INDEX IF NOT EXISTS idx_resource_report ON performance_resource(reportId);
CREATE INDEX IF NOT EXISTS idx_script_report ON script_metric(reportId);
CREATE INDEX IF NOT EXISTS idx_task_status ON monitor_task(status);
CREATE INDEX IF NOT EXISTS idx_monitor_task ON monitor_result(taskId);
`)

export default db
