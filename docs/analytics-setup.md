# Analytics Setup Guide

This document covers everything needed to configure Google Analytics 4 (GA4) and Microsoft Clarity for Fixera. The code is already integrated — this guide is about the dashboard configuration and environment variables required to activate it.

---

## Environment Variables

Two new environment variables are introduced. Add both to your deployment environment (e.g. Vercel project settings) and to `.env.local` for local development.

```env
# Google Analytics 4 — Measurement ID from your GA4 data stream
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Microsoft Clarity — Project ID from your Clarity project
NEXT_PUBLIC_MS_CLARITY_PROJECT_ID=your_clarity_project_id
```

> **Important:** Both are `NEXT_PUBLIC_` variables, meaning they are embedded into the client bundle at build time. Ensure they are set in your hosting environment **before** building and deploying — changes to these values require a redeploy.

Scripts are loaded **only after the visitor grants analytics consent** via the cookie banner. If consent is not given, neither GA4 nor Clarity will initialise.

---

## Part 1 — Google Analytics 4

### Step 1: Create a GA4 Property

1. Go to [analytics.google.com](https://analytics.google.com)
2. Click **Admin** (gear icon, bottom-left)
3. Under the **Account** column → **Create Account** (or select an existing account)
4. Under the **Property** column → **Create Property**
5. Enter a property name (e.g. `Fixera Production`), select your timezone and currency → **Next**
6. Fill in business category and size → **Create**
7. Choose **Web** as the platform
8. Enter your site URL and a stream name (e.g. `Fixera Web`) → **Create stream**
9. On the stream details page, copy the **Measurement ID** (format: `G-XXXXXXXXXX`)

Set this as `NEXT_PUBLIC_GA_MEASUREMENT_ID` in your environment.

---

### Step 2: Mark Key Events

GA4 key events (formerly called "conversions") are the events Fixera considers meaningful business actions. They appear highlighted in reports and power the key event rate metric.

1. In GA4 → **Admin** → **Data display** → **Events**
2. Click **+ New key event** (top-right)
3. Add each of the following event names one by one:

| Event name | What it tracks |
|---|---|
| `purchase` | GA4 ecommerce revenue event — fires on payment success page |
| `complete_booking` | Booking confirmed (payment success page reached) |
| `begin_checkout` | Payment intent created / user reaches payment page |
| `complete_rfq` | RFQ form submitted successfully |
| `begin_rfq` | RFQ package selected by the user |
| `generate_lead` | RFQ submitted or professional contacted via chat |
| `view_item` | Project detail page viewed |
| `project_search` | Search performed with type = projects |

> **Note:** If an event name hasn't been received yet, click **+ New key event** and type the name directly — you don't need to wait for the event to appear in the list first.

---

### Step 3: Create Custom Dimensions

Custom dimensions allow you to use Fixera-specific parameters in your reports (e.g. filter by page type or traffic channel).

1. **Admin** → **Data display** → **Custom definitions** → **Create custom dimension**
2. Create all of the following — all are **Event scoped**:

| Dimension name | Event parameter | Description |
|---|---|---|
| Page Type | `page_type` | Type of page (`landing_page`, `blog`, `project_detail`, `search`, etc.) |
| Traffic Bucket | `traffic_bucket` | Classified traffic channel (see values below) |
| Project Category | `project_category` | Category of the project viewed or booked |
| Project Service | `project_service` | Service type of the project |
| Search Type | `search_type` | Whether the search was for `projects` or `professionals` |
| Results Count | `results_count` | Number of search results returned |
| Filters Count | `filters_count` | Number of active filters applied to a search |
| Booking ID | `booking_id` | Internal booking identifier |

**`page_type` values:** `landing_page`, `blog`, `news`, `service_landing`, `project_detail`, `search`, `professional_profile`, `content_page`, `auth`, `app`, `admin`, `other`

**`traffic_bucket` values:** `direct`, `google_organic`, `google_ads`, `facebook`, `facebook_ads`, `instagram`, `instagram_ads`, `email_campaign`, `ai`, `organic_other`, `referral_other`

---

### Step 4: Build Reports (Explorations)

Go to **Explore** (left navigation) → **Blank** to create each report below.

#### Traffic Acquisition Report

Answers: which channels drive users, sessions, and revenue?

- **Dimensions:** Session source / medium, Traffic Bucket (custom)
- **Metrics:** Users, New users, Sessions, Engagement rate, Session key event rate, Total revenue
- **Filter / Comparison:** Country

#### Pages Engagement Report

Answers: which pages drive the most engagement and conversion?

- **Dimensions:** Page path + query string, Page Type (custom)
- **Metrics:** Users, New users, Sessions, Average engagement time per session, Engagement rate, Session key event rate, Total revenue
- **Filter / Comparison:** Country

#### Purchase Funnel Report

Answers: where do users drop off in the booking flow? Desktop vs mobile comparison?

1. Go to **Explore** → **Funnel exploration**
2. Add steps in this order:

| Step | Event name |
|---|---|
| 1 | `session_start` |
| 2 | `project_search` |
| 3 | `view_item` |
| 4 | `begin_rfq` or `begin_checkout` |
| 5 | `complete_rfq` or `begin_checkout` |
| 6 | `begin_checkout` |
| 7 | `complete_booking` |

1. Under **Breakdown** → select **Device category** (gives desktop vs phone/tablet comparison)
2. Add **Country** as a filter or comparison dimension

---

### Step 5: Verify GA4 is Receiving Data

1. Open your deployed site in Chrome
2. Accept the cookie/analytics consent banner
3. Open DevTools → **Network** tab → filter by `collect`
4. Navigate around the site and perform actions (search, view a project)
5. You should see requests to `www.google-analytics.com/g/collect` returning `204` — this confirms events are being received

In GA4, go to **Reports → Realtime overview** to see active users appear immediately. Standard reports populate within 24–48 hours.

---

## Part 2 — Microsoft Clarity

### Step 1: Create a Clarity Project

1. Go to [clarity.microsoft.com](https://clarity.microsoft.com)
2. Click **New project**
3. Enter your site name and URL → **Create**
4. On the setup screen, copy the **Project ID** (short alphanumeric string, e.g. `abc12de3fg`)

Set this as `NEXT_PUBLIC_MS_CLARITY_PROJECT_ID` in your environment.

---

### Step 2: Link Clarity to GA4

This integration lets you filter Clarity session recordings and heatmaps by GA4 segments (e.g. view recordings from users who completed a booking).

1. In Clarity → open your project → **Settings** (top-right gear icon)
2. Click the **Setup** tab → scroll to **Google Analytics**
3. Click **Connect to Google Analytics**
4. Sign in with the Google account that owns the GA4 property
5. Select the GA4 property created in Part 1 → **Save**

---

### Step 3: Verify Clarity is Working

1. Open the deployed site in Chrome
2. Accept the analytics consent banner
3. Open DevTools → **Network** tab → filter by `clarity`
4. You should see requests to `https://www.clarity.ms/collect`

Session recordings appear in Clarity within a few minutes of the first visit. Heatmaps accumulate over time as more users visit.

---

## Custom Events in Clarity

The code also sends Clarity custom events matching the GA4 event names (via `clarity('event', eventName)`). This means you can filter Clarity recordings by the same funnel steps:

- Filter recordings where `project_search` fired → see how users searched
- Filter recordings where `begin_checkout` fired but `complete_booking` did not → find drop-off behaviour

Additionally, two Clarity custom tags are set per page:
- `page_type` — matches the GA4 `page_type` dimension values
- `traffic_bucket` — matches the GA4 `traffic_bucket` dimension values

These tags appear in the Clarity dashboard under **Filters** when viewing recordings.

---

## Events Reference

All events sent by Fixera to GA4 and Clarity:

| Event | Trigger | GA4 ecommerce? |
|---|---|---|
| `page_view` | Every pathname change (after consent) | No |
| `search` | Every successful search | No |
| `project_search` | Successful search with type = projects | No |
| `view_item` | Project detail page loaded | Yes (`items[]`) |
| `begin_booking` | Fixed/unit package selected | No |
| `begin_rfq` | RFQ package selected | Yes (`items[]`) |
| `complete_rfq` | RFQ submitted successfully | Yes (`items[]`) |
| `generate_lead` | RFQ submitted or professional contacted | No |
| `contact_professional` | Chat opened from a project page | No |
| `begin_checkout` | Payment intent created / payment page reached | Yes (`items[]`) |
| `payment_authorized` | Stripe authorization confirmed by backend | No |
| `booking_request_submitted` | Non-RFQ booking request submitted | No |
| `complete_booking` | Payment success page reached | Yes (`items[]`) |
| `purchase` | Payment success page reached (revenue event) | Yes (`items[]`, `value`, `transaction_id`) |
