// ─────────────────────────────────────────────
// DEMO MODE: Pre-computed mock results
// Simulates a full swarm run without API calls
// ─────────────────────────────────────────────

export const DEMO_CODE = `# Legacy E-Commerce Order Processing System
# WARNING: This file has grown organically over 3 years
# TODO: Refactor this mess (added 2021-03-15)
# FIXME: Memory leak in process_batch (added 2022-01-08)

import json, os, sys, time, hashlib, random
from datetime import datetime, timedelta
from typing import Any

DB_HOST = "prod-db-01.internal.company.com"
DB_PASSWORD = "admin123!@#"  # TODO: move to env vars
API_KEY = "sk-live-abc123xyz789"
STRIPE_SECRET = "sk_live_rk_test_abc"

class OrderProcessor:
    def __init__(self):
        self.orders = []
        self.processed = []
        self.errors = []
        self.db = None
        self.cache = {}
        self.retry_count = 3
        self.timeout = 30
        self.batch_size = 100
        self.max_retries = 5
        self.debug = True
        self.log_file = "/tmp/orders.log"
        self.temp_files = []
        self._setup_logging()

    def _setup_logging(self):
        import logging
        self.logger = logging.getLogger()
        self.logger.addHandler(logging.FileHandler("/var/log/orders.log"))

    def connect_db(self):
        import sqlite3
        self.db = sqlite3.connect(DB_HOST)
        return self.db

    def process_order(self, order_data):
        try:
            if not order_data:
                return {"error": "no data"}
            if not order_data.get("customer_id"):
                return {"error": "no customer"}
            if not order_data.get("items"):
                return {"error": "no items"}
            if len(order_data["items"]) == 0:
                return {"error": "empty items"}

            total = 0
            for item in order_data["items"]:
                if item["quantity"] <= 0:
                    return {"error": f"bad quantity for {item['name']}"}
                stock = self._check_stock(item["product_id"])
                if stock < item["quantity"]:
                    return {"error": f"insufficient stock for {item['name']}"}
                price = self._get_price(item["product_id"])
                if item.get("discount"):
                    if item["discount"] > 50:
                        price = price * 0.5
                    elif item["discount"] > 25:
                        price = price * 0.75
                    elif item["discount"] > 10:
                        price = price * 0.9
                    else:
                        price = price * (1 - item["discount"]/100)
                total += price * item["quantity"]

            if order_data.get("state") == "CA":
                tax = total * 0.0725
            elif order_data.get("state") == "NY":
                tax = total * 0.08
            elif order_data.get("state") == "TX":
                tax = total * 0.0625
            else:
                tax = total * 0.05

            total_with_tax = total + tax

            payment_result = self._charge_customer(
                order_data["customer_id"], total_with_tax,
                order_data.get("payment_method", "credit_card"))

            if payment_result["status"] != "success":
                self.errors.append({"order": order_data, "error": payment_result, "timestamp": str(datetime.now())})
                return {"error": "payment failed"}

            order = {
                "id": hashlib.md5(str(time.time()).encode()).hexdigest(),
                "customer_id": order_data["customer_id"],
                "items": order_data["items"],
                "total": total, "tax": tax, "grand_total": total_with_tax,
                "payment_id": payment_result["id"],
                "status": "confirmed",
                "created_at": str(datetime.now()),
            }

            if self.db:
                self.db.execute(
                    f"INSERT INTO orders VALUES ('{order['id']}', "
                    f"'{order['customer_id']}', '{json.dumps(order['items'])}', "
                    f"{order['total']}, '{order['status']}')")
                self.db.commit()

            self._send_email(order_data["customer_id"], "Order Confirmed",
                           f"Your order {order['id']} has been confirmed.")
            self._send_sms(order_data["customer_id"],
                         f"Order {order['id']} confirmed! Total: \${total_with_tax:.2f}")

            for item in order_data["items"]:
                self._update_stock(item["product_id"], -item["quantity"])

            self.processed.append(order)
            self.cache[order["id"]] = order

            if self.debug:
                print(f"[DEBUG] Processed order {order['id']}")
                with open(self.log_file, "a") as f:
                    f.write(f"{datetime.now()} - Order {order['id']} processed\\n")

            return order
        except Exception as e:
            print(f"ERROR: {str(e)}")
            return {"error": str(e)}

    def _check_stock(self, product_id):
        return random.randint(0, 100)

    def _get_price(self, product_id):
        prices = {"PROD001": 29.99, "PROD002": 49.99, "PROD003": 99.99}
        return prices.get(product_id, 9.99)

    def _charge_customer(self, customer_id, amount, method):
        import requests
        resp = requests.post("https://api.stripe.com/v1/charges",
            headers={"Authorization": f"Bearer {STRIPE_SECRET}"},
            data={"amount": int(amount * 100), "currency": "usd"})
        return resp.json()

    def _send_email(self, customer_id, subject, body):
        import smtplib
        server = smtplib.SMTP("smtp.company.com", 587)
        server.login("orders@company.com", "emailpass123")
        server.sendmail("orders@company.com", f"{customer_id}@email.com",
                       f"Subject: {subject}\\n\\n{body}")

    def _send_sms(self, customer_id, message):
        import requests
        requests.post("https://api.twilio.com/send",
            auth=("ACXXX", "authtoken123"),
            data={"to": f"+1{customer_id}", "body": message})

    def _update_stock(self, product_id, delta):
        if self.db:
            self.db.execute(
                f"UPDATE inventory SET quantity = quantity + {delta} "
                f"WHERE product_id = '{product_id}'")

    def process_batch(self, orders):
        results = []
        for o in orders:
            r = self.process_order(o)
            results.append(r)
            time.sleep(0.1)
        return results

    def generate_report(self):
        report = "ORDER REPORT\\n"
        report += f"Total processed: {len(self.processed)}\\n"
        report += f"Total errors: {len(self.errors)}\\n"
        for o in self.processed:
            report += f"  Order {o['id']}: \${o['grand_total']:.2f}\\n"
        return report
`;

export const DEMO_RESULTS = {
  architect: {
    metrics: { cyclomatic_complexity: 47, maintainability_index: 22, lines_of_code: 148, code_duplication_pct: 18, coupling_score: 82, cohesion_score: 25, tech_debt_hours: 32, test_coverage: 0 },
    architecture_issues: [
      { title: "God Class Anti-Pattern", severity: "critical", description: "OrderProcessor handles validation, payment processing, notifications, inventory management, reporting, and database operations in a single 200+ line class with 12 methods. This violates SRP and makes the class impossible to test in isolation.", line: 18 },
      { title: "Hardcoded Credentials in Source", severity: "critical", description: "Database password (admin123!@#), Stripe API key (sk_live_rk_test_abc), SMTP credentials, and Twilio auth token are all embedded directly in source code. These will be committed to version control.", line: 9 },
      { title: "SQL Injection Vulnerability", severity: "critical", description: "String interpolation used in SQL queries (f-string INSERT and UPDATE). Attacker-controlled order_id or customer_id values can execute arbitrary SQL.", line: 91 },
      { title: "No Input Validation Layer", severity: "high", description: "Validation is inline within process_order() using cascading if-statements. No schema validation, type checking, or sanitization of user-provided data.", line: 43 },
      { title: "Tight Coupling to External Services", severity: "high", description: "Direct HTTP calls to Stripe, Twilio, and SMTP within business logic methods. No abstraction layer, no circuit breaker, no retry mechanism.", line: 108 },
      { title: "Unbounded Cache Growth", severity: "high", description: "self.cache dictionary grows indefinitely with every processed order. No eviction policy, TTL, or size limit. Will cause OOM in production.", line: 27 },
      { title: "Synchronous Batch Processing", severity: "medium", description: "process_batch() iterates sequentially with time.sleep(0.1) between orders. A batch of 1000 orders takes 100+ seconds minimum.", line: 130 },
      { title: "MD5 for ID Generation", severity: "medium", description: "Using MD5 hash of timestamp for order IDs. MD5 is cryptographically broken and time-based seeding creates collision risk under concurrent load.", line: 84 },
      { title: "No Error Recovery Strategy", severity: "medium", description: "Generic except Exception catch with print() statement. No structured logging, no retry logic, no dead-letter queue for failed orders.", line: 102 },
      { title: "Hardcoded Tax Rates", severity: "low", description: "Tax calculation uses hardcoded state-specific rates in if/elif chain. Should use a configurable tax service or lookup table.", line: 67 }
    ],
    anti_patterns: ["God Class", "Magic Numbers", "Spaghetti Code", "Hardcoded Configuration", "Train Wreck"],
    design_patterns_found: [],
    module_boundaries: ["OrderValidation", "PaymentGateway", "NotificationService", "InventoryManager", "TaxCalculator", "OrderRepository", "ConfigManager"],
    summary: "Critical legacy system with zero separation of concerns. The OrderProcessor class is a God Class handling 7 distinct responsibilities. Contains 3 critical security vulnerabilities (hardcoded secrets, SQL injection, broken crypto), zero test coverage, and severe coupling to external services. Estimated 32 hours of technical debt."
  },
  security: {
    vulnerabilities: [
      { title: "Hardcoded Database Credentials", severity: "critical", description: "DB_PASSWORD = 'admin123!@#' on line 10. Credentials committed to source code are exposed in version control history, CI/CD logs, and any code review process.", line: 10, cwe: "CWE-798", fix_suggestion: "Use environment variables via os.environ or a secrets manager (AWS Secrets Manager, HashiCorp Vault). Never commit credentials." },
      { title: "Hardcoded API Keys", severity: "critical", description: "Stripe secret key (sk_live_rk_test_abc) and Twilio auth token (authtoken123) embedded in source. These grant full API access to payment and messaging systems.", line: 11, cwe: "CWE-798", fix_suggestion: "Inject via environment variables. Rotate all exposed keys immediately." },
      { title: "SQL Injection in INSERT", severity: "critical", description: "f-string interpolation in SQL INSERT statement. Malicious customer_id containing SQL metacharacters (e.g., '); DROP TABLE orders;--) executes arbitrary queries.", line: 91, cwe: "CWE-89", fix_suggestion: "Use parameterized queries: cursor.execute('INSERT INTO orders VALUES (?, ?, ?, ?, ?)', (id, customer_id, items, total, status))" },
      { title: "SQL Injection in UPDATE", severity: "critical", description: "f-string interpolation in UPDATE inventory query. product_id input can inject arbitrary SQL into the WHERE clause.", line: 127, cwe: "CWE-89", fix_suggestion: "Use parameterized queries with placeholders." },
      { title: "SMTP Credentials in Source", severity: "high", description: "Email password 'emailpass123' hardcoded in _send_email method. Grants access to company email system.", line: 115, cwe: "CWE-798", fix_suggestion: "Use OAuth2 for SMTP or inject credentials via environment." },
      { title: "Weak Hash for ID Generation", severity: "high", description: "MD5 of timestamp used for order ID generation. MD5 has known collision attacks and time-based seeding is predictable.", line: 84, cwe: "CWE-328", fix_suggestion: "Use uuid.uuid4() for unique IDs or secrets.token_hex() for cryptographic randomness." },
      { title: "No TLS Certificate Verification", severity: "medium", description: "requests.post() calls to Stripe and Twilio APIs don't explicitly verify SSL certificates. While Python requests defaults to verification, the lack of explicit configuration is a risk if defaults change.", line: 108, cwe: "CWE-295", fix_suggestion: "Explicitly set verify=True and pin certificates for critical payment APIs." },
      { title: "Debug Mode Enabled in Production", severity: "medium", description: "self.debug = True with print() statements and file writes to /tmp. Information leakage risk in production.", line: 28, cwe: "CWE-215", fix_suggestion: "Use structured logging with configurable log levels. Never use print() in production." }
    ],
    secrets_found: [
      { type: "Database Password", line: 10 },
      { type: "Stripe Secret Key", line: 12 },
      { type: "Generic API Key", line: 11 },
      { type: "SMTP Password", line: 115 },
      { type: "Twilio Auth Token", line: 121 }
    ],
    risk_score: 92,
    summary: "CRITICAL security posture. 5 hardcoded secrets found across database, payment, email, and messaging systems. 2 SQL injection vectors allow arbitrary database manipulation. Weak cryptographic hash used for order IDs. All secrets must be rotated immediately after remediation."
  },
  optimizer: {
    bottlenecks: [
      { title: "Synchronous Sequential Batch Processing", severity: "high", description: "process_batch() processes orders one-by-one with time.sleep(0.1) between each. No concurrency, no async I/O. A 1000-order batch takes minimum 100 seconds.", line: 130, impact: "O(n) latency with 100ms floor per order", fix: "Use asyncio.gather() with a semaphore-limited concurrency pool. Process 50-100 orders concurrently." },
      { title: "Unbounded In-Memory Cache", severity: "high", description: "self.cache grows without limit. After 100K orders, this dictionary consumes ~500MB+ of heap. No eviction, no TTL, no LRU policy.", line: 27, impact: "Linear memory growth leading to OOM", fix: "Use functools.lru_cache with maxsize, or an external cache (Redis) with TTL." },
      { title: "Blocking Network Calls in Hot Path", severity: "high", description: "Synchronous requests.post() to Stripe, Twilio, and SMTP servers in the order processing pipeline. Each call blocks 100-500ms.", line: 108, impact: "3x network round-trips per order (1-2s total)", fix: "Use aiohttp for async HTTP calls. Decouple notifications via message queue (RabbitMQ/SQS)." },
      { title: "No Connection Pooling", severity: "medium", description: "New SMTP connection created for every email. New SQLite connection per connect_db() call. No pool reuse.", line: 34, impact: "TCP handshake overhead per operation", fix: "Use connection pools (SQLAlchemy pool, aiosmtplib with connection reuse)." },
      { title: "File I/O in Hot Path", severity: "medium", description: "Debug logging writes to file with open/write/close cycle per order when debug=True.", line: 97, impact: "Disk I/O blocking per order", fix: "Use async logging handler or buffered writer." }
    ],
    performance_score: 28,
    memory_issues: ["Unbounded self.cache dictionary", "self.orders list grows without cleanup", "self.processed list retains all historical orders", "self.errors list never trimmed"],
    summary: "Severe performance issues. No concurrency model (fully synchronous). 3 blocking network calls per order. Unbounded memory growth across 4 data structures. Estimated throughput: ~5 orders/second. With async refactoring and connection pooling: ~200+ orders/second achievable."
  },
  refactor: {
    refactored_code: `"""
Order Processing System - Refactored Architecture
Clean, modular design following SOLID principles with dependency injection,
secure patterns, and comprehensive error handling.
"""

import uuid
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import List, Optional, Protocol
from datetime import datetime

# ── Configuration (from environment) ──

@dataclass(frozen=True)
class AppConfig:
    """Immutable configuration loaded from environment variables."""
    db_url: str
    stripe_key: str
    smtp_host: str
    smtp_port: int
    twilio_sid: str
    twilio_token: str
    debug: bool = False
    batch_concurrency: int = 50
    cache_max_size: int = 10000

    @classmethod
    def from_env(cls) -> "AppConfig":
        import os
        return cls(
            db_url=os.environ["DATABASE_URL"],
            stripe_key=os.environ["STRIPE_SECRET_KEY"],
            smtp_host=os.environ.get("SMTP_HOST", "smtp.company.com"),
            smtp_port=int(os.environ.get("SMTP_PORT", "587")),
            twilio_sid=os.environ["TWILIO_SID"],
            twilio_token=os.environ["TWILIO_TOKEN"],
            debug=os.environ.get("DEBUG", "false").lower() == "true",
        )

# ── Domain Models ──

class OrderStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class OrderItem:
    product_id: str
    name: str
    quantity: int
    unit_price: Decimal
    discount_pct: Decimal = Decimal("0")

    @property
    def line_total(self) -> Decimal:
        discount_multiplier = Decimal("1") - (self.discount_pct / Decimal("100"))
        return self.unit_price * self.quantity * discount_multiplier

@dataclass
class Order:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str = ""
    items: List[OrderItem] = field(default_factory=list)
    subtotal: Decimal = Decimal("0")
    tax: Decimal = Decimal("0")
    total: Decimal = Decimal("0")
    status: OrderStatus = OrderStatus.PENDING
    payment_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)

# ── Port Interfaces (Dependency Inversion) ──

class PaymentGateway(Protocol):
    async def charge(self, customer_id: str, amount: Decimal) -> dict: ...

class NotificationService(Protocol):
    async def send_email(self, to: str, subject: str, body: str) -> bool: ...
    async def send_sms(self, to: str, message: str) -> bool: ...

class InventoryService(Protocol):
    async def check_stock(self, product_id: str) -> int: ...
    async def reserve(self, product_id: str, qty: int) -> bool: ...

class OrderRepository(Protocol):
    async def save(self, order: Order) -> None: ...
    async def find_by_id(self, order_id: str) -> Optional[Order]: ...

# ── Tax Strategy ──

class TaxCalculator:
    """Configurable tax calculation with rate lookup."""

    DEFAULT_RATES = {
        "CA": Decimal("0.0725"),
        "NY": Decimal("0.0800"),
        "TX": Decimal("0.0625"),
    }
    DEFAULT_RATE = Decimal("0.0500")

    def __init__(self, rates: dict = None):
        self.rates = rates or self.DEFAULT_RATES

    def calculate(self, subtotal: Decimal, state: str) -> Decimal:
        rate = self.rates.get(state, self.DEFAULT_RATE)
        return (subtotal * rate).quantize(Decimal("0.01"))

# ── Input Validation ──

class OrderValidationError(Exception):
    def __init__(self, field: str, message: str):
        self.field = field
        super().__init__(f"Validation error [{field}]: {message}")

class OrderValidator:
    """Validates order input before processing."""

    def validate(self, data: dict) -> dict:
        if not data:
            raise OrderValidationError("order", "Order data is required")

        customer_id = data.get("customer_id")
        if not customer_id or not isinstance(customer_id, str):
            raise OrderValidationError("customer_id", "Valid customer ID required")

        items = data.get("items")
        if not items or not isinstance(items, list) or len(items) == 0:
            raise OrderValidationError("items", "At least one item required")

        for i, item in enumerate(items):
            if not item.get("product_id"):
                raise OrderValidationError(f"items[{i}].product_id", "Required")
            if not isinstance(item.get("quantity", 0), int) or item["quantity"] <= 0:
                raise OrderValidationError(f"items[{i}].quantity", "Must be positive integer")

        return data

# ── Order Processing Service ──

class OrderService:
    """Orchestrates order processing with injected dependencies."""

    def __init__(
        self,
        payment: PaymentGateway,
        notifications: NotificationService,
        inventory: InventoryService,
        repository: OrderRepository,
        tax_calculator: TaxCalculator,
        validator: OrderValidator,
        logger: logging.Logger = None,
    ):
        self.payment = payment
        self.notifications = notifications
        self.inventory = inventory
        self.repository = repository
        self.tax = tax_calculator
        self.validator = validator
        self.log = logger or logging.getLogger(__name__)

    async def process(self, data: dict) -> Order:
        \"\"\"Process a single order through the full pipeline.\"\"\"
        # 1. Validate
        self.validator.validate(data)

        # 2. Build order items with stock verification
        items = []
        for item_data in data["items"]:
            stock = await self.inventory.check_stock(item_data["product_id"])
            if stock < item_data["quantity"]:
                raise OrderValidationError(
                    f"stock.{item_data['product_id']}",
                    f"Insufficient stock ({stock} available, {item_data['quantity']} requested)"
                )
            items.append(OrderItem(
                product_id=item_data["product_id"],
                name=item_data.get("name", item_data["product_id"]),
                quantity=item_data["quantity"],
                unit_price=Decimal(str(item_data.get("price", "9.99"))),
                discount_pct=Decimal(str(item_data.get("discount", "0"))),
            ))

        # 3. Calculate totals
        subtotal = sum(item.line_total for item in items)
        tax = self.tax.calculate(subtotal, data.get("state", ""))
        total = subtotal + tax

        # 4. Process payment
        payment_result = await self.payment.charge(data["customer_id"], total)
        if payment_result.get("status") != "success":
            raise RuntimeError(f"Payment failed: {payment_result.get('error', 'Unknown')}")

        # 5. Create order
        order = Order(
            customer_id=data["customer_id"],
            items=items, subtotal=subtotal,
            tax=tax, total=total,
            status=OrderStatus.CONFIRMED,
            payment_id=payment_result.get("id"),
        )

        # 6. Reserve inventory
        for item in items:
            await self.inventory.reserve(item.product_id, item.quantity)

        # 7. Persist
        await self.repository.save(order)

        # 8. Notify (fire-and-forget, don't block on notifications)
        try:
            await self.notifications.send_email(
                data["customer_id"],
                "Order Confirmed",
                f"Order {order.id} confirmed. Total: \${order.total}",
            )
        except Exception as e:
            self.log.warning(f"Notification failed for order {order.id}: {e}")

        self.log.info(f"Order {order.id} processed successfully. Total: {order.total}")
        return order

    async def process_batch(self, orders: list, concurrency: int = 50) -> list:
        \"\"\"Process a batch of orders with controlled concurrency.\"\"\"
        import asyncio
        semaphore = asyncio.Semaphore(concurrency)
        results = []

        async def _process_one(data):
            async with semaphore:
                try:
                    order = await self.process(data)
                    return {"status": "success", "order": order}
                except Exception as e:
                    self.log.error(f"Batch item failed: {e}")
                    return {"status": "error", "error": str(e), "data": data}

        results = await asyncio.gather(*[_process_one(o) for o in orders])
        successful = [r for r in results if r["status"] == "success"]
        failed = [r for r in results if r["status"] == "error"]
        self.log.info(f"Batch complete: {len(successful)} succeeded, {len(failed)} failed")
        return results

    async def generate_report(self) -> dict:
        \"\"\"Generate an order processing report.\"\"\"
        # Delegate to repository for aggregation
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "service": "OrderService",
            "status": "operational",
        }


# ── Concrete Implementations ──

class StripePaymentGateway:
    \"\"\"Stripe payment gateway implementation.\"\"\"

    def __init__(self, config: AppConfig):
        self.api_key = config.stripe_key

    async def charge(self, customer_id: str, amount: Decimal) -> dict:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.stripe.com/v1/charges",
                headers={"Authorization": f"Bearer {self.api_key}"},
                data={"amount": int(amount * 100), "currency": "usd", "customer": customer_id},
            ) as resp:
                if resp.status != 200:
                    return {"status": "failed", "error": f"Stripe returned {resp.status}"}
                data = await resp.json()
                return {"status": "success", "id": data.get("id", "")}


class EmailNotificationService:
    \"\"\"Email + SMS notification service with error isolation.\"\"\"

    def __init__(self, config: AppConfig):
        self.config = config

    async def send_email(self, to: str, subject: str, body: str) -> bool:
        import aiosmtplib
        try:
            await aiosmtplib.send(
                body, sender="orders@company.com", recipients=[to],
                hostname=self.config.smtp_host, port=self.config.smtp_port,
            )
            return True
        except Exception:
            return False

    async def send_sms(self, to: str, message: str) -> bool:
        # Placeholder for Twilio async integration
        return True


class PostgresOrderRepository:
    \"\"\"PostgreSQL order repository using SQLAlchemy async.\"\"\"

    def __init__(self, config: AppConfig):
        self.db_url = config.db_url

    async def save(self, order: Order) -> None:
        # Uses parameterized queries via SQLAlchemy ORM — no SQL injection
        logging.getLogger(__name__).info(f"Persisted order {order.id}")

    async def find_by_id(self, order_id: str) -> Optional[Order]:
        return None  # Implement with SQLAlchemy AsyncSession


class InMemoryInventoryService:
    \"\"\"Inventory service implementation.\"\"\"

    def __init__(self):
        self._stock = {}

    async def check_stock(self, product_id: str) -> int:
        return self._stock.get(product_id, 100)

    async def reserve(self, product_id: str, qty: int) -> bool:
        current = self._stock.get(product_id, 100)
        if current < qty:
            return False
        self._stock[product_id] = current - qty
        return True


# ── Factory ──

def create_order_service(config: AppConfig) -> OrderService:
    \"\"\"Wire up all dependencies and return a configured OrderService.\"\"\"
    return OrderService(
        payment=StripePaymentGateway(config),
        notifications=EmailNotificationService(config),
        inventory=InMemoryInventoryService(),
        repository=PostgresOrderRepository(config),
        tax_calculator=TaxCalculator(),
        validator=OrderValidator(),
    )


# ── Entry Point ──

if __name__ == "__main__":
    import asyncio

    config = AppConfig.from_env()
    service = create_order_service(config)

    sample_order = {
        "customer_id": "cust_001",
        "items": [
            {"product_id": "PROD001", "name": "Widget", "quantity": 2, "price": "29.99"},
            {"product_id": "PROD002", "name": "Gadget", "quantity": 1, "price": "49.99"},
        ],
        "state": "CA",
    }

    async def main():
        order = await service.process(sample_order)
        print(f"Order {order.id} processed. Total: {order.total}")

    asyncio.run(main())
`,
    changes: [
      { type: "extract", description: "Extracted OrderValidator class with structured field-level error reporting" },
      { type: "extract", description: "Extracted TaxCalculator with configurable rate lookup table" },
      { type: "extract", description: "Extracted domain models (Order, OrderItem, OrderStatus) as dataclasses" },
      { type: "restructure", description: "Introduced Protocol-based dependency injection for PaymentGateway, NotificationService, InventoryService, OrderRepository" },
      { type: "secure", description: "Replaced hardcoded credentials with AppConfig.from_env() loading from environment variables" },
      { type: "secure", description: "Eliminated SQL injection by requiring parameterized OrderRepository interface" },
      { type: "secure", description: "Replaced MD5 with uuid.uuid4() for order ID generation" },
      { type: "restructure", description: "Converted to async/await architecture for concurrent I/O operations" },
      { type: "remove", description: "Removed unbounded cache, debug print statements, and hardcoded file paths" },
      { type: "add", description: "Added structured logging with configurable log levels" },
      { type: "add", description: "Added Decimal type for financial calculations to avoid floating-point errors" }
    ],
    patterns_applied: ["Dependency Injection", "Repository Pattern", "Strategy Pattern", "Protocol-based Interfaces", "Value Objects", "Domain-Driven Design", "Clean Architecture", "Factory Method"],
    before_after: { complexity_before: 47, complexity_after: 6, maintainability_before: 22, maintainability_after: 86 },
    summary: "Complete architectural overhaul. Decomposed God Class into 7 focused modules with Protocol-based DI. Eliminated all security vulnerabilities. Converted to async architecture. Applied 8 design patterns. Cyclomatic complexity reduced 87% (47 to 6). Maintainability index improved 290% (22 to 86)."
  },
  tester: {
    test_code: `\"\"\"
Comprehensive Test Suite for Order Processing System
Generated by NEXUS REFACTOR Test Agent
\"\"\"
import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

# ── Fixtures ──

@pytest.fixture
def mock_payment():
    gw = AsyncMock()
    gw.charge.return_value = {"status": "success", "id": "pay_test123"}
    return gw

@pytest.fixture
def mock_notifications():
    ns = AsyncMock()
    ns.send_email.return_value = True
    ns.send_sms.return_value = True
    return ns

@pytest.fixture
def mock_inventory():
    inv = AsyncMock()
    inv.check_stock.return_value = 100
    inv.reserve.return_value = True
    return inv

@pytest.fixture
def mock_repository():
    repo = AsyncMock()
    return repo

@pytest.fixture
def order_service(mock_payment, mock_notifications, mock_inventory, mock_repository):
    return OrderService(
        payment=mock_payment,
        notifications=mock_notifications,
        inventory=mock_inventory,
        repository=mock_repository,
        tax_calculator=TaxCalculator(),
        validator=OrderValidator(),
    )

@pytest.fixture
def valid_order_data():
    return {
        "customer_id": "cust_001",
        "items": [
            {"product_id": "PROD001", "name": "Widget", "quantity": 2, "price": "29.99"},
            {"product_id": "PROD002", "name": "Gadget", "quantity": 1, "price": "49.99"},
        ],
        "state": "CA",
    }

# ── Unit Tests: Validation ──

class TestOrderValidator:
    def test_valid_order_passes(self, valid_order_data):
        validator = OrderValidator()
        result = validator.validate(valid_order_data)
        assert result == valid_order_data

    def test_empty_data_raises(self):
        with pytest.raises(OrderValidationError, match="order"):
            OrderValidator().validate(None)

    def test_missing_customer_id_raises(self):
        with pytest.raises(OrderValidationError, match="customer_id"):
            OrderValidator().validate({"items": [{"product_id": "X", "quantity": 1}]})

    def test_empty_items_raises(self):
        with pytest.raises(OrderValidationError, match="items"):
            OrderValidator().validate({"customer_id": "c1", "items": []})

    def test_zero_quantity_raises(self):
        with pytest.raises(OrderValidationError, match="quantity"):
            OrderValidator().validate({
                "customer_id": "c1",
                "items": [{"product_id": "X", "quantity": 0}]
            })

    def test_negative_quantity_raises(self):
        with pytest.raises(OrderValidationError, match="quantity"):
            OrderValidator().validate({
                "customer_id": "c1",
                "items": [{"product_id": "X", "quantity": -5}]
            })

# ── Unit Tests: Tax ──

class TestTaxCalculator:
    @pytest.mark.parametrize("state,expected_rate", [
        ("CA", Decimal("0.0725")),
        ("NY", Decimal("0.0800")),
        ("TX", Decimal("0.0625")),
        ("FL", Decimal("0.0500")),
    ])
    def test_state_tax_rates(self, state, expected_rate):
        calc = TaxCalculator()
        tax = calc.calculate(Decimal("100.00"), state)
        assert tax == (Decimal("100.00") * expected_rate).quantize(Decimal("0.01"))

    def test_unknown_state_uses_default(self):
        calc = TaxCalculator()
        tax = calc.calculate(Decimal("100.00"), "ZZ")
        assert tax == Decimal("5.00")

# ── Integration Tests: OrderService ──

class TestOrderService:
    @pytest.mark.asyncio
    async def test_successful_order(self, order_service, valid_order_data, mock_repository):
        order = await order_service.process(valid_order_data)
        assert order.status == OrderStatus.CONFIRMED
        assert order.customer_id == "cust_001"
        assert order.payment_id == "pay_test123"
        mock_repository.save.assert_called_once()

    @pytest.mark.asyncio
    async def test_insufficient_stock_raises(self, order_service, valid_order_data, mock_inventory):
        mock_inventory.check_stock.return_value = 0
        with pytest.raises(OrderValidationError, match="Insufficient stock"):
            await order_service.process(valid_order_data)

    @pytest.mark.asyncio
    async def test_payment_failure_raises(self, order_service, valid_order_data, mock_payment):
        mock_payment.charge.return_value = {"status": "failed", "error": "Declined"}
        with pytest.raises(RuntimeError, match="Payment failed"):
            await order_service.process(valid_order_data)

    @pytest.mark.asyncio
    async def test_notification_failure_doesnt_block(self, order_service, valid_order_data, mock_notifications):
        mock_notifications.send_email.side_effect = Exception("SMTP down")
        order = await order_service.process(valid_order_data)
        assert order.status == OrderStatus.CONFIRMED  # Order still succeeds

# ── Security Tests ──

class TestSecurityValidation:
    def test_sql_injection_in_customer_id(self):
        validator = OrderValidator()
        # Should pass validation (SQL injection is handled by parameterized queries)
        data = validator.validate({
            "customer_id": "'; DROP TABLE orders;--",
            "items": [{"product_id": "X", "quantity": 1}]
        })
        assert data["customer_id"] == "'; DROP TABLE orders;--"

    def test_order_id_is_uuid(self):
        order = Order(customer_id="test")
        assert len(order.id) == 36  # UUID format
        assert "-" in order.id

# ── Edge Case Tests ──

class TestEdgeCases:
    def test_order_item_with_100_percent_discount(self):
        item = OrderItem(product_id="X", name="Free", quantity=1,
                        unit_price=Decimal("50.00"), discount_pct=Decimal("100"))
        assert item.line_total == Decimal("0")

    def test_order_item_with_no_discount(self):
        item = OrderItem(product_id="X", name="Full Price", quantity=3,
                        unit_price=Decimal("10.00"))
        assert item.line_total == Decimal("30.00")

    def test_decimal_precision_in_totals(self):
        item = OrderItem(product_id="X", name="Precise", quantity=3,
                        unit_price=Decimal("33.33"), discount_pct=Decimal("15"))
        expected = Decimal("33.33") * 3 * Decimal("0.85")
        assert item.line_total == expected
`,
    test_count: 18,
    coverage_estimate: 91,
    categories: { unit: 8, integration: 4, edge_case: 3, security: 2, regression: 1 },
    frameworks_used: ["pytest", "pytest-asyncio", "unittest.mock"],
    summary: "18 tests across 5 categories. 91% estimated coverage. Tests validator edge cases, tax calculation, async order flow, payment/notification failure handling, SQL injection safety, UUID generation, and decimal precision."
  },
  migrator: {
    migrations: [
      { title: "SQLite to PostgreSQL + SQLAlchemy", from: "sqlite3 (direct SQL strings)", to: "PostgreSQL + SQLAlchemy 2.0 async", effort_hours: 12, impact: "high", steps: ["Install asyncpg and SQLAlchemy[asyncio]", "Define ORM models for Order, OrderItem, Inventory", "Create Alembic migration scripts", "Replace raw SQL with repository pattern using AsyncSession", "Add connection pooling configuration", "Set up database URL from environment"] },
      { title: "Sync to Async Architecture", from: "synchronous requests + time.sleep", to: "asyncio + aiohttp + aiomqp", effort_hours: 8, impact: "critical", steps: ["Convert all I/O methods to async/await", "Replace requests with aiohttp ClientSession", "Add semaphore-limited concurrency for batch processing", "Implement message queue for notification decoupling"] },
      { title: "SMTP to Transactional Email Service", from: "smtplib direct", to: "SendGrid API or AWS SES", effort_hours: 4, impact: "medium", steps: ["Choose provider (SendGrid recommended for templates)", "Create email templates", "Replace SMTP calls with async API client", "Add delivery tracking and bounce handling"] },
      { title: "Framework Migration to FastAPI", from: "No web framework (script)", to: "FastAPI + Pydantic + Uvicorn", effort_hours: 16, impact: "high", steps: ["Create FastAPI application with router structure", "Define Pydantic request/response schemas", "Add OpenAPI documentation annotations", "Implement health check and metrics endpoints", "Add rate limiting middleware", "Configure Uvicorn with proper worker count"] }
    ],
    modernization_score: 18,
    framework_recommendations: [
      { name: "FastAPI", reason: "Async-native, automatic OpenAPI docs, Pydantic validation, excellent performance" },
      { name: "SQLAlchemy 2.0", reason: "Async support, type-safe queries, Alembic migrations, connection pooling" },
      { name: "Celery + Redis", reason: "Background task processing for notifications and batch operations" },
      { name: "Pydantic", reason: "Data validation, serialization, settings management from environment" }
    ],
    summary: "4 migration paths identified. Current modernization score: 18/100. Priority: async conversion (critical), database migration (high), framework adoption (high), email service migration (medium). Total estimated effort: 40 hours."
  },
  documenter: {
    readme: `# Order Processing System

A modular, async-first order processing service built with clean architecture principles.

## Architecture

The system follows Domain-Driven Design with dependency injection:

- **OrderService** — Orchestrates the order processing pipeline
- **OrderValidator** — Input validation with structured error reporting
- **TaxCalculator** — Configurable state-based tax computation
- **PaymentGateway** — Protocol-based payment processing abstraction
- **NotificationService** — Email and SMS notification dispatch
- **InventoryService** — Stock verification and reservation
- **OrderRepository** — Persistence abstraction for order storage

## Quick Start

\`\`\`bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run tests
pytest tests/ -v --cov=src

# Start the service
uvicorn src.main:app --reload
\`\`\`

## Configuration

All configuration is loaded from environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| STRIPE_SECRET_KEY | Yes | Stripe API secret key |
| TWILIO_SID | Yes | Twilio account SID |
| TWILIO_TOKEN | Yes | Twilio auth token |
| SMTP_HOST | No | Email server (default: smtp.company.com) |
| DEBUG | No | Enable debug logging (default: false) |

## Testing

\`\`\`bash
pytest tests/ -v --cov=src --cov-report=html
\`\`\`

## License

MIT`,
    api_docs: `## API Endpoints

### POST /orders
Process a new order.

**Request Body:**
\`\`\`json
{
  "customer_id": "cust_001",
  "items": [
    {"product_id": "PROD001", "name": "Widget", "quantity": 2, "price": "29.99"}
  ],
  "state": "CA",
  "payment_method": "credit_card"
}
\`\`\`

**Response (201 Created):**
\`\`\`json
{
  "id": "uuid",
  "status": "confirmed",
  "total": "64.33",
  "tax": "4.35"
}
\`\`\`

### GET /orders/{order_id}
Retrieve order by ID.

### GET /health
Service health check.`,
    architecture_mermaid: `graph TD
    A[API Gateway / FastAPI] --> B[OrderService]
    B --> C[OrderValidator]
    B --> D[TaxCalculator]
    B --> E[PaymentGateway]
    B --> F[InventoryService]
    B --> G[OrderRepository]
    B --> H[NotificationService]
    E --> I[Stripe API]
    H --> J[SendGrid]
    H --> K[Twilio]
    G --> L[PostgreSQL]
    F --> L
    style A fill:#3B82F6,color:#fff
    style B fill:#059669,color:#fff
    style L fill:#7C3AED,color:#fff`,
    changelog: [
      "BREAKING: Removed all hardcoded credentials. Environment variables required.",
      "BREAKING: Converted to async/await. All service methods are now coroutines.",
      "Added: Dependency injection via Protocol-based interfaces",
      "Added: Structured input validation with field-level error reporting",
      "Added: Domain models using dataclasses with Decimal precision",
      "Added: Configurable TaxCalculator with rate lookup",
      "Fixed: SQL injection vulnerabilities (parameterized queries via repository)",
      "Fixed: MD5 ID generation replaced with uuid4",
      "Removed: God Class OrderProcessor decomposed into 7 focused modules",
      "Removed: Unbounded cache, debug print statements, temp file I/O"
    ],
    summary: "Generated README with quick start guide, API documentation with request/response schemas, Mermaid architecture diagram showing module dependencies, and a 10-entry changelog documenting all breaking changes and fixes."
  },
  reviewer: {
    grade: "A-",
    approved: true,
    confidence: 88,
    categories: {
      architecture: { score: 9, notes: "Excellent decomposition from God Class to 7 focused modules. Clean DI with Protocol interfaces. Follows DDD bounded contexts." },
      security: { score: 9, notes: "All hardcoded secrets eliminated. SQL injection fixed via repository abstraction. UUID4 for IDs. Only minor concern: input sanitization could be more thorough." },
      performance: { score: 7, notes: "Async architecture is a major improvement. Notification fire-and-forget is good. However, batch processing with semaphore limiting is mentioned but not fully implemented in refactored code." },
      maintainability: { score: 9, notes: "Maintainability index improved from 22 to 86. Clear naming, type hints throughout, dataclass models. Well-structured for team onboarding." },
      test_quality: { score: 8, notes: "91% coverage with good variety (unit, integration, edge, security). Proper async test fixtures. Could add property-based testing for financial calculations." },
      documentation: { score: 8, notes: "Comprehensive README with quick start. API docs with examples. Mermaid diagram. Changelog is thorough. Could benefit from ADR documents." }
    },
    recommendations: [
      "Add property-based testing (Hypothesis) for financial calculation edge cases",
      "Implement circuit breaker pattern for external service calls (Stripe, Twilio)",
      "Add OpenTelemetry tracing for distributed observability",
      "Consider event sourcing for order state transitions",
      "Add rate limiting middleware before deployment",
      "Create Architecture Decision Records (ADRs) for key design choices"
    ],
    final_assessment: "The refactoring represents a dramatic improvement from a critical-severity legacy codebase to a well-architected, secure, and maintainable system. The transformation from a monolithic God Class (complexity 47) to a modular async architecture (complexity 6) with 91% test coverage demonstrates strong engineering judgment. All critical security vulnerabilities have been addressed. The code is production-ready with minor recommendations for enhanced observability and resilience patterns."
  }
};
