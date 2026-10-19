# User manual

This manual is for the people who use LogisticOS every day: company owners and administrators, dispatchers, hub staff, accountants, drivers and customers. Menu items you cannot see are hidden because your role, or your company's plan, does not include them.

## 1. Signing in and getting started

### Create a company account
1. Open the site and choose **Start free trial**.
2. Enter your company name, your name, work email, phone and a password (at least 10 characters with letters and numbers), and type the password again to confirm it. Use the eye icon to show or hide what you typed.
3. After you sign up you are taken to a short **setup wizard**.

### The setup wizard
| Step | What you set |
|---|---|
| Company | Name, contact details and address, shown on invoices and tracking pages. |
| Branch and hub | Your first branch and the hub where parcels are sorted. |
| Zones and starting prices | Delivery zones and starting prices. The wizard creates real pricing rules from your numbers. |
| Operations and proof | Which proof of delivery is required (photo, signature, OTP, GPS, recipient name). |
| Invoicing and tax | Tax rate and invoice prefix. |
| Notifications | Which channels (in-app, email, SMS, WhatsApp) may be used. A channel only sends once its provider is set up. |

You can change all of this later under **Settings**.

### Sign in, password reset and two-factor
* Sign in with your email and password. Too many wrong attempts lock the account for 15 minutes.
* **Forgot your password?** enters your email and sends a single-use reset link (email must be configured). Resetting signs you out everywhere.
* **Two-factor authentication.** Under **Settings, My account** you can turn on an authenticator-app code. Scan the QR code, enter the first code, and **save the 8 recovery codes**. Each recovery code works once. To turn it off you need your password and a current code or a recovery code.

## 2. The dashboard

The dashboard shows today's picture at a glance:

* **Headline cards:** today's shipments, delivery success over 30 days, revenue this month, and cash on delivery held by drivers.
* **Shipment pipeline:** how many shipments are at each stage, with links to the filtered list.
* **Needs attention:** computed from your real data, such as overdue deliveries, failed deliveries awaiting a decision, cash held by drivers, and expiring documents.
* **Fleet and people, Cash and settlements, charts:** volume, revenue, failure reasons, driver, zone and branch performance.

## 3. Shipments

### Create a shipment
1. Choose **Shipments, New shipment**.
2. Optionally pick a **customer account**. Sender details fill in automatically.
3. Enter the **sender and pickup** details. Pick the **state**, then the **city or area**. If a city is missing, an administrator can choose **City missing? Add it**.
4. Choose **how the recipient will receive it**:
   * **Home or address delivery:** enter the delivery address, state and city.
   * **Collect at a hub or pickup point:** choose the collection point. No delivery address is needed.
5. Describe the package: type, weight, quantity, declared value, dimensions, priority, and any **cash on delivery** amount.
6. Choose who pays the delivery fee, then use **Preview price** to see how the fee is built from your pricing rules.
7. Choose **Create shipment**. You are taken straight to the new shipment's page.

If no pricing rule matches the route, the preview says so. An administrator can add a rule, or you can enter a manual fee override (recorded in the audit log).

### Work with a shipment
The shipment page shows the status, sender and recipient, package, charges, proof requirements, timeline and, once available, the proof of delivery. The **Actions** panel offers only the moves that are valid right now and that your role may perform: confirm, assign a driver, arrived at hub, ready for dispatch or ready for pickup, start delivery, return, cancel. **Print label** produces a label with a QR code. **Public tracking** opens the page your customer sees.

### Find shipments
The shipments list has status shortcuts (pending pickup, at hub, ready for pickup, out for delivery, delivered, failed, returns) and filters for search text, driver, branch, cash on delivery and unassigned.

## 4. Dispatch

**Dispatch** is the board for assigning work.
* Select shipments, choose a driver or rider, and assign. The driver's vehicle is used automatically.
* Shipments waiting for a rider are grouped; drivers show their status and workload.
* A shipment booked for hub pickup is only assigned a rider for the sender pickup. Once it is at the hub it leaves the board.

**Live map** shows driver positions reported by the driver app, with the time of the last update. **Routes** groups deliveries into multi-stop runs and can suggest an order (a simple heuristic, shown as such).

## 5. Hubs, branches, zones and cities

Under **Hubs and branches** you manage:
* **Branches** and **hubs, warehouses, sorting centres and pickup points.** Turn on **Customers can collect shipments here** for any location where recipients may collect. Add its street address and opening hours.
* **Delivery zones.** A zone lists the cities, areas or states it covers. Shipments match a zone by delivery city, then state. Zones drive pricing.
* **Cities you added.** Add a city that is missing from the built-in list, and remove ones you no longer need. Put the city in a zone so it gets priced.

### Hub pickup in practice
1. A rider collects the parcel from the sender.
2. Hub staff choose **Arrived at hub** and select the collection point.
3. They choose **Ready for pickup.** The recipient is sent a 6-digit collection code.
4. When the recipient arrives, staff choose **Hand over to recipient**, check the ID, enter the collector's name and the code, and the cash due if it is a cash-on-delivery parcel.
5. If a recipient lost the code, **Resend collection code** sends a new one. A manager can hand over without a code by entering a reason, which is recorded in the audit log.
6. Parcels not collected within 7 days appear under **Needs attention**.

## 6. Customers

**Customers** lists individuals, businesses, corporate accounts and marketplace sellers. A customer page shows shipments, invoices, saved addresses and contact details. You can create a **portal login** so the customer can book and follow their own shipments, and turn a customer into a **corporate account** with a discount and API access.

## 7. Drivers and riders

**Drivers and riders** shows your team with status, vehicle, branch, active tasks, last GPS time and licence expiry, plus summary cards (active, available, on a task, offline or idle, licences expiring). Add a driver with the form, optionally giving them a login for the driver app.

### The driver app
Drivers sign in at the same address and are taken to a mobile-friendly view.
* **Tasks:** pickups and deliveries, most urgent first. Accept a task, then call, message or navigate to the customer.
* **Mark picked up, start delivery,** then **complete delivery** with the proof your company requires.
* **Failed delivery:** choose a reason and optionally a new date.
* **Report an issue** or press **SOS** to alert dispatch with the driver's location.
* **Online or offline** availability, and a shift status.
* **No signal?** Actions are saved on the phone and sent automatically when the connection returns. A "pending sync" indicator shows what is waiting.
* **Earnings and statements** show what is owed to the driver.

## 8. Fleet

**Fleet** holds vehicles, their status, assigned driver, maintenance records and documents (insurance, roadworthiness). The system alerts you before documents expire and when service is due. A vehicle in maintenance cannot be assigned work.

## 9. Cash on delivery, invoices and settlements

### Cash on delivery
**Cash on delivery** shows what is due, collected, held by drivers, owed to senders and disputed.
* **Cash held by drivers:** when a driver hands cash to the office, choose **Receive cash**. It is applied to their oldest collections first.
* **Payable to senders:** once cash has been received, choose **Settle** to record the payout to the sender.
* A collection that differs from the amount due is marked **disputed** and raised for review.

### Invoices and payments
Create invoices for customers, record payments, and track overdue invoices. Tax and prefix settings come from Settings.

### Expenses and driver settlements
Record expenses. **Driver settlements** calculates what each driver or rider is owed for a period and produces a statement.

### Pricing rules
**Pricing rules** lists the rules in priority order; the first active rule that matches sets the price. A rule can match by zone to zone, weight band, priority (standard, express and so on), interstate, customer type or corporate account, and can add a cash-on-delivery fee, insurance and a minimum. The **Price simulator** lets you test a route and weight.
The **base price** is the starting fee for a shipment up to the rule's included weight. Weight above it is charged per kilogram.

## 10. Reports, analytics and the AI assistant

* **Analytics** and **Reports** show performance by day, driver, zone and branch. Reports export to Excel or PDF.
* **AI assistant** answers questions about your own data. It only uses what your role is allowed to see. Anything that would change data is shown as a proposal that you must confirm. It needs an AI provider key to be configured.

## 11. Notifications

The bell shows alerts for you. **Notifications** lets you choose which categories you receive and through which channels. Customer messages (for example "out for delivery" or "ready for pickup") can be edited in **Settings, Notifications**.

## 12. Staff and permissions

**Settings, Team and roles** (administrators) lets you add staff, choose a role, restrict someone to a branch, and grant or deny individual permissions. Deactivating a user or changing their role signs them out immediately.

## 13. Documents and audit log

**Documents** stores company files with expiry dates and alerts. **Audit log** is a permanent record of important actions: who did what, and when. It cannot be edited.

## 14. Subscription and billing

**Subscription** shows your plan, usage against limits, and payment history.
* **Choose a plan** to pay by card through Paystack. Switching plan part-way through a period shows the amount due after a credit for the unused part of your current plan.
* **Auto-renewal.** If you tick "save my card and renew automatically", the card is charged about a day before your period ends. You can turn it off or remove the card on the same page.
* **Cancel at period end** keeps access until the paid period finishes.
* A failed payment gives a 7-day grace period; after that the workspace becomes read-only until payment is made. Your data is kept.

## 15. For customers

* **Track a shipment:** enter the tracking number at `/track`. The page shows progress, the timeline, and for hub pickup the collection point, opening hours and instructions.
* **Book a pickup:** if the company has enabled it, use its booking page to get a price and a tracking number instantly.
* **Customer portal:** sign in to see your shipments and invoices, book new shipments and manage your team.
* **Collecting a parcel:** bring a valid ID and the 6-digit code sent to you.

## 16. Getting help

Use **Support** inside the app to log a ticket, or email the support address shown in the footer of the website.
