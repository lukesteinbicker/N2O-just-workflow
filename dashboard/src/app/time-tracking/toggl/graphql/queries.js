import { gql } from '@apollo/client';

export const TIME_TRACKING_ME = gql`
  query TimeTrackingMe {
    timeTrackingMe {
      id
      fullname
      email
    }
  }
`;

export const TIME_TRACKING_WORKSPACE = gql`
  query TimeTrackingWorkspace {
    timeTrackingWorkspace {
      id
      name
    }
  }
`;

export const TIME_TRACKING_MEMBERS = gql`
  query TimeTrackingMembers {
    timeTrackingMembers {
      id
      name
      email
      role
      active
    }
  }
`;

export const TIME_TRACKING_PROJECTS = gql`
  query TimeTrackingProjects {
    timeTrackingProjects {
      id
      name
      clientId
      color
      active
    }
  }
`;

export const TIME_TRACKING_CLIENTS = gql`
  query TimeTrackingClients {
    timeTrackingClients {
      id
      name
    }
  }
`;

export const TIME_TRACKING_TAGS = gql`
  query TimeTrackingTags {
    timeTrackingTags {
      id
      name
    }
  }
`;

export const TIME_TRACKING_DASHBOARD_ACTIVITY = gql`
  query TimeTrackingDashboardActivity {
    timeTrackingDashboardActivity {
      userId
      description
      duration
      projectId
      start
      stop
    }
  }
`;

export const TIME_TRACKING_CURRENT_TIMER = gql`
  query TimeTrackingCurrentTimer {
    timeTrackingCurrentTimer {
      description
      start
      duration
      projectId
    }
  }
`;

export const TIME_TRACKING_ENTRIES = gql`
  query TimeTrackingEntries($startDate: String!, $endDate: String!, $limit: Int, $offset: Int) {
    timeTrackingEntries(startDate: $startDate, endDate: $endDate, limit: $limit, offset: $offset) {
      id
      description
      start
      stop
      seconds
      projectId
      tagIds
      userId
      billable
    }
  }
`;

export const TRIGGER_SYNC = gql`
  mutation TriggerTimeTrackingSync {
    triggerTimeTrackingSync {
      status
      lastSyncAt
      entriesUpserted
    }
  }
`;
