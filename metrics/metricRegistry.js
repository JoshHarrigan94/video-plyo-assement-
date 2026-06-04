export const metricRegistry = [
  {
    id: "contact_count",
    label: "Contact Count",
    unit: "contacts",
    source: "events.contacts",
    status: "planned"
  },
  {
    id: "flight_time",
    label: "Flight Time",
    unit: "s",
    source: "events.flights",
    status: "planned"
  },
  {
    id: "ground_contact_time",
    label: "Ground Contact Time",
    unit: "ms",
    source: "events.contacts",
    status: "planned"
  },
  {
    id: "jump_height",
    label: "Jump Height",
    unit: "cm",
    source: "flight_time_or_com_displacement",
    status: "planned"
  },
  {
    id: "rsi",
    label: "Reactive Strength Index",
    unit: "m/s",
    source: "jump_height / ground_contact_time",
    status: "planned"
  },
  {
    id: "estimated_peak_force",
    label: "Estimated Peak Force",
    unit: "N",
    source: "athlete_reference + kinematic model",
    status: "research"
  }
];
