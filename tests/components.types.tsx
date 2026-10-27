import {
  Button,
  Field,
  IconButton,
  Pagination,
  Stack,
  Row,
  Panel,
} from "../src/components/index.js";
// Compile-only API contract. Widening a forbidden API fails these expectations.
<Button variant="primary" size="compact">
  Save
</Button>;
<Field label="Title" />;
<IconButton label="Close">×</IconButton>;
<Pagination label="Pages" count={10} />;
// @ts-expect-error semantic variants are bounded
<Button variant="special">Save</Button>;
// @ts-expect-error shared controls do not permit per-call style forks
<Button style={{ padding: 1 }}>Save</Button>;
// @ts-expect-error fields require a visible label
<Field />;
// @ts-expect-error icon controls require an accessible label
<IconButton>×</IconButton>;
// @ts-expect-error pagination requires an accessible name
<Pagination count={10} />;

// @ts-expect-error named layout spacing only
<Stack gap="17px" />;
// @ts-expect-error named padding only
<Panel padding={12} />;
// @ts-expect-error no layout escape hatch
<Row style={{ gap: 3 }} />;
