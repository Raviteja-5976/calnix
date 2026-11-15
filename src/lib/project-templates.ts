import type { Priority } from "./types";

/** A starting plan. Due dates are days after the project starts. */
export interface Template {
  id: string;
  name: string;
  goal: string;
  milestones: { title: string; day: number; tasks: { title: string; priority?: Priority }[] }[];
}

export const TEMPLATES: Template[] = [
  {
    id: "product-launch",
    name: "Product launch",
    goal: "Launch the product to customers on time with a clear story.",
    milestones: [
      {
        title: "Positioning ready",
        day: 10,
        tasks: [
          { title: "Write the positioning statement", priority: "high" },
          { title: "Define the target audience" },
          { title: "Collect three customer quotes" },
        ],
      },
      {
        title: "Launch assets done",
        day: 24,
        tasks: [
          { title: "Draft the launch blog post", priority: "high" },
          { title: "Design social graphics" },
          { title: "Record the demo video" },
          { title: "Update the pricing page" },
        ],
      },
      {
        title: "Launch day",
        day: 30,
        tasks: [
          { title: "Send the launch email", priority: "urgent" },
          { title: "Post on social channels" },
          { title: "Monitor feedback and support" },
        ],
      },
    ],
  },
  {
    id: "software-release",
    name: "Software release",
    goal: "Ship a stable release with the agreed scope.",
    milestones: [
      {
        title: "Scope agreed",
        day: 5,
        tasks: [{ title: "Write the release spec", priority: "high" }, { title: "Estimate the work" }, { title: "Review with the team" }],
      },
      {
        title: "Feature complete",
        day: 21,
        tasks: [{ title: "Build the core features", priority: "high" }, { title: "Write tests" }, { title: "Update the docs" }],
      },
      {
        title: "Released",
        day: 28,
        tasks: [
          { title: "Run QA on staging", priority: "high" },
          { title: "Fix release blockers", priority: "urgent" },
          { title: "Deploy to production" },
          { title: "Write release notes" },
        ],
      },
    ],
  },
  {
    id: "client-onboarding",
    name: "Client onboarding",
    goal: "Get a new client set up and seeing value within a month.",
    milestones: [
      {
        title: "Kickoff",
        day: 3,
        tasks: [{ title: "Hold the kickoff call", priority: "high" }, { title: "Share the onboarding plan" }, { title: "Collect access and assets" }],
      },
      {
        title: "Setup complete",
        day: 14,
        tasks: [{ title: "Configure the account" }, { title: "Import client data" }, { title: "Train the client team" }],
      },
      {
        title: "First results",
        day: 30,
        tasks: [{ title: "Review results with the client", priority: "high" }, { title: "Agree next steps" }],
      },
    ],
  },
  {
    id: "course-build",
    name: "Course build",
    goal: "Create and publish a course students finish and recommend.",
    milestones: [
      {
        title: "Curriculum outlined",
        day: 7,
        tasks: [{ title: "Define learning outcomes", priority: "high" }, { title: "Outline modules and lessons" }],
      },
      {
        title: "Content recorded",
        day: 35,
        tasks: [{ title: "Write lesson scripts" }, { title: "Record lessons" }, { title: "Build exercises and labs" }],
      },
      {
        title: "Course published",
        day: 45,
        tasks: [{ title: "Edit and upload videos" }, { title: "Beta test with students", priority: "high" }, { title: "Publish and announce" }],
      },
    ],
  },
];
