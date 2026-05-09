# Edutu - Admin & Mobile App Functionality Plan

## 1. Overview
The goal is to ensure maximum functionality for the Edutu platform by establishing the `admin` web application as the central command hub and fully integrating the `edutu_mobile` application to react to these controls via Supabase.

## 2. Admin Panel (Control Center)
The admin panel needs to be built from its current stub state into a fully functional dashboard.
**Features to Add:**
*   **Dashboard Statistics**: Overview of total users, active engagement, and newly created content.
*   **Opportunity Management (CRUD)**: A complete interface for admins to create, edit, view, and delete opportunities. These inputs act as the data source for the mobile app.
*   **User Management**: An interface to view mobile app users, their statuses, and potentially manage access.
*   **Marketplace / Goals Control**: Admin capabilities to manage the data displayed in the mobile app's marketplace.

## 3. Mobile App (edutu_mobile)
The mobile app contains the frontend screens but needs to be dynamically wired to the data the admin panel provides.
**Features to Connect:**
*   **Opportunities Feed**: Connect the UI to fetch real-time opportunities from the Supabase tables managed by the admin.
*   **Data Sync**: Ensure any inputs from the mobile side (user profiles, chat metadata) are properly structured in Supabase so the admin panel can track them stats.

## 4. Execution Steps
*   **Step A**: Define any missing Supabase tables/policies needed for Opportunities and User Management.
*   **Step B**: Scaffold the Admin UI (Data Tables, Forms) using standard React admin patterns and connect to Supabase.
*   **Step C**: Wire the Mobile App components (`useSupabase` hooks or similar) to fetch and display the admin-generated data.
*   **Step D**: Conduct Manual Verification (creating an item on Admin, viewing it on Mobile).
