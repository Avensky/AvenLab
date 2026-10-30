// Shared by world selection and authoring; importing it never loads vehicles.
export type MapDefinition = { id: string; name: string; desc: string };
export const mapCatalog: MapDefinition[] = [
  {
    id: "streaming_endless_city",
    name: "Streaming Endless City",
    desc: "Large streamed city built from repeating detailed 2x2 chunks.",
  },
  {
    id: "road_jump_lab",
    name: "Road & Jump Lab",
    desc: "Measured seams, rooftop jump, open gap and a ground return route. BRZ proving map.",
  },
  {
    id: "workshop_yard",
    name: "Workshop Yard",
    desc: "The selection garage placed in a drivable map, with measured walls and an open bay.",
  },
  {
    id: "road_precision",
    name: "Road Precision Test",
    desc: "Measured GLB asphalt and curbs. Opposing carriageways, modular sidewalks, no hidden floor.",
  },
];
