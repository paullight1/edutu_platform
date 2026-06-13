export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export function paginate<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResponse<T> {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(100, Math.max(1, params.perPage || 20));
  const totalPages = Math.ceil(total / perPage);

  return {
    data,
    meta: {
      total,
      page,
      perPage,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export function getPaginationParams(query: {
  page?: string;
  perPage?: string;
}): PaginationParams {
  return {
    page: query.page ? parseInt(query.page, 10) : 1,
    perPage: query.perPage ? parseInt(query.perPage, 10) : 20,
  };
}
