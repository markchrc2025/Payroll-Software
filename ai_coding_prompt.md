# **Context & Persona**

You are an elite Staff Full-Stack Engineer and System Architect. We are building a highly scalable, multi-tenant B2B SaaS application: an End-to-End HRIS and Payroll Software localized for the Philippines. Our target market ranges from Micro-SMEs (1-10 employees) to Mid-Market enterprises (up to 5,000+ employees).

I am a solo founder/bootstrapper, so the code must be clean, highly maintainable, thoroughly documented, and strictly typed.

# **Reference Material**

Please refer to the attached document: ph\_payroll\_blueprint.md. This blueprint contains:

1. The Core Computation Engine (DOLE standards, Philippine Labor Code multipliers, statutory deduction rules for SSS, PhilHealth, Pag-IBIG, and Withholding Tax).  
2. The 5 Core Platform Feature Modules.  
3. Our Tiered Packaging Strategy (Starter, Growth, Pro).  
4. Strict Technical Non-Functional Requirements.

# **Technology Stack (Suggested)**

*Please use the following stack unless we discuss otherwise:*

* **Frontend:** Next.js (App Router), React, Tailwind CSS, shadcn/ui (for fast, clean component development).  
* **Backend:** Next.js API Routes (or tRPC/Server Actions).  
* **Database:** PostgreSQL (essential for relational integrity and scaling to 5,000+ employees).  
* **ORM:** Prisma or Drizzle ORM.  
* **Types:** Strict TypeScript everywhere.  
* **Money/Currency:** Use Decimal.js or standard numeric/decimal DB types for ALL financial calculations to avoid floating-point errors.

# **Core Directives**

1. **Multi-Tenancy:** Every database query MUST be scoped by company\_id (or tenant\_id). Data leakage between companies is a fatal error.  
2. **Scalability:** The payroll processing function must be able to handle batch computations for up to 5,000 employees efficiently. Use background jobs or batch processing where necessary.  
3. **Auditability:** Never hard-delete financial or payroll records. Use soft deletes (deleted\_at) and implement effective dating for salary changes.  
4. **Security:** Ensure Role-Based Access Control (RBAC) is implemented from day one (Admin vs. Employee/ESS).

# **Execution Plan (Step-by-Step)**

*Do not build the entire app at once. We will build this iteratively. Please start by acknowledging this prompt and then executing **Phase 1**.*

### **Phase 1: Database Schema & Multi-Tenancy Architecture**

* Initialize the project and the ORM.  
* Create the core schema for Multi-tenancy (Company, User, Role).  
* Create the schema for the Core HRIS (Employee, Department, Branch, Statutory\_IDs).  
* Ensure all monetary fields use Decimal types.  
* *Prompt me to review the schema before moving to the API/UI.*

### **Phase 2: Employee Information Management (Module 1\)**

* Build the CRUD APIs for Employees.  
* Create a paginated data table UI to view employees.  
* Implement a CSV bulk upload parser for onboarding large numbers of employees at once.

### **Phase 3: The Computation Engine Core (The Math)**

* Create a standalone TypeScript utility/service class for the Computation Engine as defined in the blueprint.  
* Implement the Daily/Hourly rate conversion logic.  
* Implement the Premium & Overtime Multipliers (DOLE Standards).  
* Implement the logic/tables for SSS, PhilHealth, Pag-IBIG, and Tax.  
* *Write unit tests for this engine before hooking it up to the UI.*

### **Phase 4: Time & Attendance (Module 2\)**

* Create the database schema for Timesheet, Attendance\_Log, and Leave\_Request.  
* Build the UI for admins to manually input time and resolve attendance issues.  
* Build the API to calculate late/undertime minutes based on shift schedules.

### **Phase 5: Dynamic Payroll Processing (Module 3\)**

* Create the Payroll\_Run, Payroll\_Item, and Payslip schemas.  
* Build the "One-Click Payroll Run" API that queries timesheets, applies the Computation Engine rules, adds dynamic allowances/deductions, and saves the gross-to-net results.  
* Build the Payroll Register Review UI (a detailed data grid showing the breakdown before finalizing).

### **Phase 6: Compliance, Reporting & ESS (Modules 4 & 5\)**

* Generate the Payslip PDF view.  
* Create export utilities for Bank Advice (CSV text files).  
* Build the Employee Self-Service (ESS) mobile-responsive dashboard for employees to view their payslips and file leaves.

**Are you ready to begin Phase 1? If so, please outline the initial database schema (Company, User, Employee) for my review.**