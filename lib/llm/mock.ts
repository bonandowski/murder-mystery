import type { LLMProvider, LLMRequest } from "./provider";
import { mockDetails, mockPlot, mockScript } from "./mockStory";

export const mockProvider: LLMProvider = {
  name: "mock",
  async generate<T>(req: LLMRequest<T>): Promise<T> {
    const { context, previous } = req;
    let data: unknown;
    if (req.step === "plot") data = mockPlot(context);
    else if (req.step === "details") data = mockDetails(context, previous.plot!);
    else data = mockScript(context, previous.plot!);
    return req.schema.parse(data);
  },
};
