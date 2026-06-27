import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { PaginationParams } from "./paginated-response";

export const PaginationQuery = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PaginationParams => {
    const request = ctx.switchToHttp().getRequest();
    const { page, perPage } = request.query;

    return {
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      perPage: perPage ? Math.min(100, Math.max(1, parseInt(perPage, 10))) : 20,
    };
  },
);
