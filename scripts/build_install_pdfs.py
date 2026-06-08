from __future__ import annotations

from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    XPreformatted,
)


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT
STAMP_FILE = datetime.now().strftime("%Y%m%d-%H%M")
STAMP_DISPLAY = datetime.now().strftime("%Y-%m-%d %I:%M %p")
PAGE_SIZE = LETTER
MARGIN = 0.25 * inch
CONTENT_WIDTH = PAGE_SIZE[0] - (2 * MARGIN)


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, generated_stamp: str = "", **kwargs):
        super().__init__(*args, **kwargs)
        self.generated_stamp = generated_stamp
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_header_footer(page_count)
            super().showPage()
        super().save()

    def _draw_header_footer(self, page_count: int):
        self.saveState()
        width, height = PAGE_SIZE
        self.setFont("Helvetica", 7)
        self.setFillColor(colors.HexColor("#4B5563"))
        self.drawRightString(width - MARGIN, height - 0.14 * inch, f"Page {self._pageNumber} of {page_count}")
        self.drawRightString(width - MARGIN, 0.10 * inch, f"Generated {self.generated_stamp}")
        self.restoreState()


def make_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "GuideTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=18,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "GuideSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=10,
            textColor=colors.HexColor("#475569"),
            spaceAfter=8,
        ),
        "h1": ParagraphStyle(
            "SectionHeading",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=13,
            textColor=colors.HexColor("#0F4C81"),
            spaceBefore=8,
            spaceAfter=4,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "StepHeading",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.2,
            leading=11,
            textColor=colors.HexColor("#1E293B"),
            spaceBefore=6,
            spaceAfter=3,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=10.1,
            textColor=colors.HexColor("#111827"),
            spaceAfter=3,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=8.8,
            textColor=colors.HexColor("#374151"),
            spaceAfter=2,
        ),
        "note": ParagraphStyle(
            "Note",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=9.6,
            textColor=colors.HexColor("#7F1D1D"),
            spaceAfter=2,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="Courier",
            fontSize=6.7,
            leading=8,
            textColor=colors.HexColor("#111827"),
        ),
        "right": ParagraphStyle(
            "Right",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=9.5,
            alignment=TA_RIGHT,
        ),
        "cell": ParagraphStyle(
            "Cell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.6,
            leading=9.1,
            alignment=TA_LEFT,
        ),
        "cell_bold": ParagraphStyle(
            "CellBold",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.6,
            leading=9.1,
            alignment=TA_LEFT,
        ),
    }


S = make_styles()


def p(text: str, style: str = "body"):
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(text, S[style])


def title(text: str, subtitle: str):
    return [p(text, "title"), p(subtitle, "subtitle")]


def heading(text: str):
    return p(text, "h1")


def step(text: str):
    return p(text, "h2")


def bullet(text: str):
    return p(f"- {text}", "body")


def warning(text: str):
    table = Table([[p(text, "note")]], colWidths=[CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF2F2")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#FCA5A5")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def note_box(text: str):
    table = Table([[p(text, "small")]], colWidths=[CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def kv_table(rows, col_widths=(2.0 * inch, CONTENT_WIDTH - 2.0 * inch)):
    data = [[p(a, "cell_bold"), p(b, "cell")] for a, b in rows]
    table = Table(data, colWidths=list(col_widths), hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E8EEF5")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def simple_table(headers, rows, widths):
    data = [[p(h, "cell_bold") for h in headers]]
    data += [[p(str(cell), "cell") for cell in row] for row in rows]
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF5")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def code_block(text: str):
    stripped = text.strip("\n")
    table = Table([[XPreformatted(stripped, S["code"])]], colWidths=[CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F3F4F6")),
                ("BOX", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def build_pdf(filename: str, story):
    out = OUT_DIR / filename
    doc = SimpleDocTemplate(
        str(out),
        pagesize=PAGE_SIZE,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title=filename,
        author="Codex for Michelle",
    )
    doc.build(
        story,
        canvasmaker=lambda *args, **kwargs: NumberedCanvas(
            *args, generated_stamp=STAMP_DISPLAY, **kwargs
        ),
    )
    return out


def install_guide_story():
    story = []
    story += title(
        "Contract Portal New Install & First Run Guide",
        f"Operator setup guide - Letter portrait, 0.25 inch margins - Prepared {STAMP_DISPLAY}",
    )
    story.append(
        note_box(
            "Assumption: This guide is for a new Linux-hosted Contract Portal install. "
            "The public website reaches Nginx on 80/443, Nginx proxies to the Node app on local port 3000, "
            "and PostgreSQL stays private on the server. Staff users do not need SSH, DBeaver, or database passwords."
        )
    )
    story.append(Spacer(1, 4))
    story.append(heading("Write These Values First"))
    story.append(
        kv_table(
            [
                ("Server SSH login", "________________________________________"),
                ("Server IP / hostname", "________________________________________"),
                ("Public portal URL", "https://__________________________________"),
                ("Linux app user", "customerportal"),
                ("App folder", "/opt/apps/customerportal/app"),
                ("Systemd service", "customerportal"),
                ("Internal app port", "3000"),
                ("PostgreSQL database", "customer_portal"),
                ("PostgreSQL app user", "customer_portal_user"),
                ("Database password", "________________________________________"),
                ("Session secret", "________________________________________"),
                ("SMTP from / store email", "________________________________________"),
            ]
        )
    )
    story.append(heading("What Runs Where"))
    story.append(
        code_block(
            """Browser / phone / tablet
  -> Nginx public HTTP/HTTPS on 80/443
  -> Node app on 127.0.0.1:3000
  -> PostgreSQL on 127.0.0.1:5432
  -> server file folders under /opt/apps/customerportal/app/data"""
        )
    )
    story.append(bullet("PostgreSQL stores shared live records: staff users, customer accounts, settings, customers, suppliers, products, imports, contracts, estimates, and drafts."))
    story.append(bullet("Server files store generated PDFs, signable/signed packets, uploaded documents, OCR staging files, and backups."))
    story.append(bullet("A true first run opens /setup before any public customer/staff login screen is usable."))

    story.append(heading("Step 1. Prepare The Server"))
    story.append(step("Install required packages"))
    story.append(code_block("sudo apt update\nsudo apt upgrade -y\nsudo apt install -y nginx postgresql postgresql-contrib curl rsync ufw openssl\n\nnode -v\nnpm -v"))
    story.append(p("If Node is missing or older than version 18, install Node LTS before continuing."))
    story.append(step("Optional OCR packages for Admin > Preimport"))
    story.append(code_block("sudo apt install -y ocrmypdf tesseract-ocr poppler-utils"))

    story.append(heading("Step 2. Create The Linux App User And Folders"))
    story.append(
        code_block(
            """sudo useradd --system --create-home --shell /usr/sbin/nologin customerportal || true

sudo mkdir -p /opt/apps/customerportal/app
sudo mkdir -p /opt/apps/customerportal/backups
sudo mkdir -p /opt/apps/customerportal/app/data/generated
sudo mkdir -p /opt/apps/customerportal/app/data/packets
sudo mkdir -p /opt/apps/customerportal/app/data/logs
sudo mkdir -p /opt/apps/customerportal/app/data/settings
sudo mkdir -p /opt/apps/customerportal/app/data/estimates
sudo mkdir -p /opt/apps/customerportal/app/data/estimate-module
sudo mkdir -p /opt/apps/customerportal/app/data/preimport

sudo chown -R customerportal:customerportal /opt/apps/customerportal"""
        )
    )

    story.append(heading("Step 3. Create PostgreSQL Database"))
    story.append(warning("Do not open PostgreSQL to the public internet. The app connects locally. DBeaver should use an SSH tunnel."))
    story.append(code_block("sudo -u postgres psql"))
    story.append(p("Inside psql, run this with the real password:"))
    story.append(code_block("CREATE USER customer_portal_user WITH PASSWORD 'CHANGE_THIS_PASSWORD';\nCREATE DATABASE customer_portal OWNER customer_portal_user;\n\\q"))
    story.append(p("If the user/database already exists, set ownership and grants:"))
    story.append(
        code_block(
            """sudo -u postgres psql -d postgres -c "ALTER DATABASE customer_portal OWNER TO customer_portal_user;"
sudo -u postgres psql -d customer_portal <<'SQL'
ALTER SCHEMA public OWNER TO customer_portal_user;
GRANT CONNECT ON DATABASE customer_portal TO customer_portal_user;
GRANT USAGE, CREATE ON SCHEMA public TO customer_portal_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO customer_portal_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO customer_portal_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO customer_portal_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO customer_portal_user;
SQL"""
        )
    )

    story.append(heading("Step 4. Package And Upload From Windows"))
    story.append(p("Run Windows commands from Windows Command Prompt. Keep the deploy archive name standard: F:\\customerportal-upload.tgz"))
    story.append(
        code_block(
            r"""cd /d F:\ONGOINGPROJECTS\CUSTOMERPORTAL

tar -czf F:\customerportal-upload.tgz --exclude=.git --exclude=node_modules --exclude=.codex_tmp --exclude=.env --exclude=DEVSERVER.odt --exclude=*.exe --exclude=data/generated --exclude=data/packets --exclude=data/logs --exclude=data/settings --exclude=data/estimates --exclude=data/estimate-module --exclude=data/preimport --exclude=customerportal-upload.tgz .

ssh SERVER_USER@SERVER_IP "mkdir -p ~/uploads"

cd /d F:\

scp customerportal-upload.tgz SERVER_USER@SERVER_IP:/home/SERVER_USER/uploads/customerportal-upload.tgz

ssh SERVER_USER@SERVER_IP"""
        )
    )

    story.append(heading("Step 5. Extract, Verify, And Copy On Linux"))
    story.append(warning("Verify the staging folder before running rsync --delete. Do not skip the ls checks."))
    story.append(
        code_block(
            """rm -rf ~/uploads/customerportal
mkdir -p ~/uploads/customerportal
tar -xzf ~/uploads/customerportal-upload.tgz -C ~/uploads/customerportal

ls ~/uploads/customerportal/package.json
ls ~/uploads/customerportal/package-lock.json
ls ~/uploads/customerportal/server/index.js
ls ~/uploads/customerportal/public/home.html

sudo rsync -av --delete \\
  --exclude node_modules \\
  --exclude .env \\
  --exclude 'data/generated' \\
  --exclude 'data/packets' \\
  --exclude 'data/logs' \\
  --exclude 'data/settings' \\
  --exclude 'data/estimates' \\
  --exclude 'data/estimate-module' \\
  --exclude 'data/preimport' \\
  ~/uploads/customerportal/ /opt/apps/customerportal/app/

sudo chown -R customerportal:customerportal /opt/apps/customerportal/app
cd /opt/apps/customerportal/app
sudo -u customerportal npm ci --omit=dev"""
        )
    )

    story.append(heading("Step 6. Create The Server .env"))
    story.append(code_block("sudo -u customerportal nano /opt/apps/customerportal/app/.env"))
    story.append(
        code_block(
            """NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://contracts-v6.edgewaterhomestores.com
SESSION_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET
STAFF_MAX_ACTIVE_SESSIONS=3
PORTAL_SEED_STAFF=false

DATABASE_URL=postgresql://customer_portal_user:CHANGE_THIS_PASSWORD@localhost:5432/customer_portal

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Contract Portal <email@example.com>"
SMTP_TO=

OCRMYPDF_BIN=ocrmypdf
TESSERACT_BIN=tesseract
PDFTOTEXT_BIN=pdftotext
OCR_LANGUAGE=eng
OCR_TIMEOUT_MS=180000"""
        )
    )
    story.append(code_block("sudo chown customerportal:customerportal /opt/apps/customerportal/app/.env\nsudo chmod 600 /opt/apps/customerportal/app/.env"))

    story.append(heading("Step 7. Create Or Confirm Systemd Service"))
    story.append(code_block("sudo nano /etc/systemd/system/customerportal.service"))
    story.append(
        code_block(
            """[Unit]
Description=Edgewater Customer Portal
After=network.target postgresql.service

[Service]
Type=simple
User=customerportal
Group=customerportal
WorkingDirectory=/opt/apps/customerportal/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target"""
        )
    )
    story.append(
        code_block(
            """sudo systemctl daemon-reload
sudo systemctl enable customerportal
sudo systemctl restart customerportal
sleep 5
sudo systemctl status customerportal --no-pager -l
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/setup/status"""
        )
    )
    story.append(p("Checkpoint: health should return {\"ok\":true}. Setup status should eventually show storage:\"postgres\" when DATABASE_URL is working."))

    story.append(heading("Step 8. Nginx Public Site"))
    story.append(p("Nginx should be the only public web entry point. The Node app port 3000 stays private."))
    story.append(code_block("sudo nano /etc/nginx/sites-available/customerportal"))
    story.append(
        code_block(
            """server {
    listen 80;
    listen [::]:80;
    server_name contracts-v6.edgewaterhomestores.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}"""
        )
    )
    story.append(code_block("sudo ln -s /etc/nginx/sites-available/customerportal /etc/nginx/sites-enabled/customerportal || true\nsudo nginx -t\nsudo systemctl reload nginx"))
    story.append(p("After DNS is pointed, use Certbot or the server's existing HTTPS process. Production cookies require HTTPS when NODE_ENV=production."))

    story.append(heading("Step 9. First Browser Setup"))
    story.append(p("Open /setup at the public site. On a true first run, /, /login, and protected pages redirect to /setup until the first admin exists."))
    story.append(kv_table([("First setup page", "https://contracts-v6.edgewaterhomestores.com/setup"), ("Creates", "Business profile, first admin user, sales tax, logo/business settings."), ("After setup", "First admin logs in, then creates staff users under Admin Menu > Users.")]))
    story.append(warning("If /setup redirects to login, staff users already exist. Do not wipe a live portal unless you intend to remove records and have a backup."))

    story.append(heading("Step 10. Clean First Run After Testing"))
    story.append(warning("Danger zone: this clears setup/users/settings and live records. Use only when intentionally resetting test data before first live use."))
    story.append(
        code_block(
            """sudo systemctl stop customerportal || true

sudo -u postgres psql -d customer_portal -c "TRUNCATE TABLE contract_drafts, contract_packets, estimate_records, import_runs, customers, suppliers, products, customer_accounts, staff_users, portal_settings RESTART IDENTITY CASCADE;"

cd /opt/apps/customerportal/app
sudo rm -f data/settings/users.json data/settings/business.json
sudo rm -rf data/generated/* data/packets/* data/logs/* data/estimates/* data/estimate-module/* data/preimport/*

sudo mkdir -p data/settings data/generated data/packets data/logs data/estimates data/estimate-module data/preimport
sudo chown -R customerportal:customerportal data

sudo sed -i 's/^PORTAL_SEED_STAFF=.*/PORTAL_SEED_STAFF=false/' /opt/apps/customerportal/app/.env

sudo systemctl start customerportal
sleep 10
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/setup/status"""
        )
    )
    story.append(p("Checkpoint: setup status should show setupRequired:true, staffConfigured:false, businessConfigured:false, and storage:postgres."))

    story.append(heading("Optional Cabinet Store RFMS Preload"))
    story.append(p("This is not part of a generic blank install. Use only for the Edgewater Cabinet Store data conversion after testing on a staging copy."))
    story.append(
        kv_table(
            [
                ("Local export folder", "Historical RFMS export reference only. Do not use C:\\ or OneDrive for active portal project/import storage."),
                ("Current package location", "Use E:\\ or F:\\ for import/export packages, then stage through the app Admin import/preimport tools."),
                ("Source database", "Local SQL Server database RFMS_ProdRFMS_20260118, confirmed EDGEWATER CABINET STORE."),
                ("Preferred import path", "Use the app Admin import/preimport tools first so validation and field mapping stay inside the app."),
                ("Direct SQL status", "A direct import attempt failed previously because PostgreSQL peer auth was used instead of the portal DATABASE_URL."),
            ]
        )
    )
    story.append(
        simple_table(
            ["Record type", "Count / status"],
            [
                ("Suppliers", "23"),
                ("Product categories/codes", "28"),
                ("Products", "633"),
                ("Inventory on hand", "40 rows"),
                ("Receiving / purchase orders", "28 receiving rows, 28 purchase order rows"),
                ("Customers", "136 derived from sales/open estimates"),
                ("Sales / sale lines", "131 sales, 182 sale lines"),
                ("Payments", "160 rows"),
                ("Open estimates / lines", "29 estimates, 44 lines"),
                ("Salespeople", "4"),
                ("Installers", "0 found; likely manual entry"),
            ],
            [2.0 * inch, CONTENT_WIDTH - 2.0 * inch],
        )
    )
    story.append(warning("Do not run RFMS preload against a live portal with real new records unless PostgreSQL and data folders are backed up and field mapping has been tested."))

    story.append(heading("DBeaver Access For PostgreSQL"))
    story.append(p("Regular staff do not need this. Use it only for owner/admin/tech inspection."))
    story.append(code_block("ssh -N -L 15432:127.0.0.1:5432 SERVER_USER@SERVER_IP"))
    story.append(kv_table([("DBeaver host", "127.0.0.1"), ("DBeaver port", "15432"), ("Database", "customer_portal"), ("User", "customer_portal_user"), ("SSL", "Disabled unless the server is configured for SSL.")]))
    story.append(note_box("If the tunnel command window looks stuck, that is normal. It is holding the tunnel open. Closing it disconnects DBeaver but does not stop PostgreSQL on the server."))

    story.append(heading("Immediate Security Lockdown"))
    for item in [
        "Public access should be HTTPS -> Nginx -> local Node app.",
        "Do not expose ports 3000, 5432, 3306, internal admin tools, or future financial modules publicly.",
        "Keep .env out of upload archives and chmod 600 on the server.",
        "Rotate temporary passwords used during setup/testing.",
        "Back up PostgreSQL and /opt/apps/customerportal/app/data before live use.",
        "Future financial systems should live behind VPN/private access for authorized Edgewater staff only.",
    ]:
        story.append(bullet(item))

    story.append(heading("Troubleshooting"))
    story.append(
        simple_table(
            ["Problem", "Check / fix"],
            [
                ("Health fails right after restart", "Wait 5-15 seconds, then rerun curl. If still down, use journalctl."),
                ("Service restarts repeatedly", "Run sudo journalctl -u customerportal -n 120 --no-pager -l."),
                ("PostgreSQL password error", "Verify DATABASE_URL in .env and ALTER USER password match."),
                ("DBeaver disconnected", "Reopen SSH tunnel. This does not mean the server DB stopped."),
                ("Nginx returns 301 on local Host curl", "It may be redirecting HTTP to HTTPS. Test with curl -k --resolve ... https://.../api/health."),
                ("Setup page does not show", "Staff users or portal_settings already exist. Check /api/setup/status."),
                ("PDF/OCR save permission error", "Run sudo chown -R customerportal:customerportal /opt/apps/customerportal/app/data."),
            ],
            [2.1 * inch, CONTENT_WIDTH - 2.1 * inch],
        )
    )
    return story


def quickstart_story():
    story = []
    story += title(
        "Contract Portal Quickstart Packet",
        f"Initial admin and staff user guide - Prepared {STAMP_DISPLAY}",
    )
    story.append(note_box("This packet is for the people using the portal after the server is installed. It does not require SSH, DBeaver, or direct PostgreSQL access."))

    story.append(heading("First Admin Quickstart"))
    story.append(step("1. Open first-run setup"))
    story.append(p("On a clean install, open /setup. If setup is complete already, the site redirects to login."))
    story.append(step("2. Enter business settings"))
    for item in ["Business name, phone, email, website, address.", "Sales tax rate.", "Logo if available.", "First admin name, username, and password."]:
        story.append(bullet(item))
    story.append(step("3. Create staff users"))
    story.append(p("Go to Admin Menu > Users. Each person should have their own login. Staff users are also the selectable sales reps/store signatures for contract records."))
    for item in ["Enter name and username.", "Set a temporary password.", "Keep Must change password checked for new users.", "Check Manager/Admin only for users allowed to manage users/settings.", "Disable users who leave instead of deleting them."]:
        story.append(bullet(item))

    story.append(heading("Business Settings Checklist"))
    story.append(
        simple_table(
            ["Area", "What to confirm"],
            [
                ("Business", "Name, address, phone, email, website, logo preview."),
                ("Sales tax", "Current sales tax rate; update history should be tracked as the app matures."),
                ("Staff signatures", "Sales reps/store signatures come from staff users. Add a saved signature only with that user's approval."),
                ("Email", "SMTP values tested before relying on email links/PDF sending."),
                ("Preimport", "Use for customers, suppliers, products, and document staging after review."),
            ],
            [1.55 * inch, CONTENT_WIDTH - 1.55 * inch],
        )
    )

    story.append(heading("Staff Quickstart"))
    story.append(step("1. Log in"))
    story.append(p("Open the portal website, click Store staff login, and enter your username/password. Change a temporary password if prompted."))
    story.append(step("2. Search before adding"))
    story.append(p("Use the portal home cards. Search by customer name, phone, address, invoice, estimate, or record ID before creating anything new."))
    story.append(step("3. Create or use an estimate"))
    for item in ["Search existing estimates first.", "Customer name, address, and phone are required for estimates. Email is optional.", "If an estimate belongs with a contract, save it and attach it through the contract flow.", "Blank estimates should be printed only when paper is needed."]:
        story.append(bullet(item))
    story.append(step("4. Create a contract"))
    for item in ["Go to Contracts.", "Search the customer first.", "Choose an existing customer or Add New.", "Complete the required workflow sections.", "Save as you go.", "Generate/send only after required sections are complete."]:
        story.append(bullet(item))
    story.append(step("5. Watch for duplicate warnings"))
    story.append(p("If a possible duplicate appears, compare record ID, customer name, phone, address, and contract/estimate details before creating another version."))

    story.append(heading("Record Actions"))
    story.append(
        simple_table(
            ["Action", "Use for"],
            [
                ("View", "Opening a customer record, contract record, estimate, PDF, image, or detail page."),
                ("Show", "Revealing a password, expanding/collapsing a section, or showing hidden text."),
                ("Email link", "Sending a customer a signing link when SMTP is configured."),
                ("Print PDF", "Opening browser print/save flow for completed documents."),
                ("Edit draft", "Continuing an editable draft before it is signed/finalized."),
                ("Exit", "Leaving the current workflow; confirm save/logout behavior if prompted."),
            ],
            [1.3 * inch, CONTENT_WIDTH - 1.3 * inch],
        )
    )

    story.append(heading("Customer Signing"))
    for item in [
        "Customers can sign through the signing link or customer portal.",
        "A signed packet saves back into the portal after completion.",
        "The first-contract password rule should not be written in customer-facing emails.",
        "Once a customer creates a portal account, future access should use the registered account password rather than the first-contract password.",
        "Manual/paper signing still needs a staff upload workflow and reminder queue in a later build.",
    ]:
        story.append(bullet(item))

    story.append(heading("What Not To Do"))
    for item in [
        "Do not share one admin login for everyone.",
        "Do not clear records without a backup.",
        "Do not open PostgreSQL to the public internet.",
        "Do not use DBeaver/SSH while entering normal customer work unless you are doing admin/tech review.",
        "Do not create a new customer/contract if a search result is already the same person/job.",
    ]:
        story.append(bullet(item))

    story.append(heading("End Of Day / Shared Computer"))
    story.append(p("Use Exit or Log out when done, especially on shared computers. Login persistence should be configured intentionally, not assumed."))
    return story


def main():
    outputs = [
        build_pdf(f"Contract_Portal_New_Install_First_Run_Guide_{STAMP_FILE}.pdf", install_guide_story()),
        build_pdf(f"Contract_Portal_Quickstart_Packet_{STAMP_FILE}.pdf", quickstart_story()),
    ]
    for out in outputs:
        print(out)


if __name__ == "__main__":
    main()
