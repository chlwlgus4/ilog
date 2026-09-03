import { createOperationsHandler } from "./handler.ts";

Deno.serve(createOperationsHandler({ env: (name) => Deno.env.get(name) }));
