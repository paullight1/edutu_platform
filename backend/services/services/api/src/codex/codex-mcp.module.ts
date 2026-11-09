import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { CodexMcpAuth } from "./codex-mcp-auth";
import { CodexMcpController } from "./codex-mcp.controller";

@Module({
  imports: [BillingModule, OpportunitiesModule],
  controllers: [CodexMcpController],
  providers: [CodexMcpAuth],
})
export class CodexMcpModule {}
