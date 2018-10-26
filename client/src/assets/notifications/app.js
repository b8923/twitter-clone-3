import React, { Component } from 'react';
import './main.css';

import { gql } from 'apollo-boost';
import { graphql, compose } from 'react-apollo';
import { Link } from 'react-router-dom';

import client from '../../apollo';
import cookieControl from '../../cookieControl';
import { apiPath } from '../../apiPath';
import { convertTime } from '../../timeConvertor';
import links from '../../links';

import LoadingIcon from '../__forall__/loader/app';

const image = "https://pbs.twimg.com/profile_images/1040133177279434753/_0WCrXJp_normal.jpg";

class Br extends Component {
	render() {
		return(
			<div className="rn-notifications-br" />
		);
	}
}

class NavButton extends Component {
	render() {
		return(
			<button className="rn-notifications-nav-btn active">{ this.props.text }</button>
		);
	}
}

class Nav extends Component {
	render() {
		return(
			<div className="rn-notifications-nav">
				{
					[
						{
							text: "All",
							stageName: "ALL_STAGE"
						}
					].map(({ text, stageName }, index) => (
						<NavButton
							key={ index }
							active={ stageName === this.props.currStage }
							text={ text }
						/>
					))
				}
			</div>
		);
	}
}

class Notification extends Component {
	generateContent = () => {
		let a = this.props.contributor.name,
				b = "";

		switch(this.props.eventType) {
			case 'CREATED_TWEET_EVENT':
				b = (
					<React.Fragment>
						<span className="rn-notifications-mat-notification-content-mat-content">Recent tweet from</span>
						<Link className="rn-notifications-mat-notification-content-mat-name" to={ `${ links["ACCOUNT_PAGE"] }/${ this.props.contributor.url }` }>{ a }</Link>
					</React.Fragment>
				);
			break;
			case 'SUBSCRIBED_USER_EVENT':
				b = (
					<React.Fragment>
						<Link className="rn-notifications-mat-notification-content-mat-name" to={ `${ links["ACCOUNT_PAGE"] }/${ this.props.contributor.url }` }>{ a }</Link>
						<span className="rn-notifications-mat-notification-content-mat-content">subscribed to you</span>
					</React.Fragment>
				);
			break;
			case 'LIKED_TWEET_EVENT':
				b = (
					<React.Fragment>
						<Link className="rn-notifications-mat-notification-content-mat-name" to={ `${ links["ACCOUNT_PAGE"] }/${ this.props.contributor.url }` }>{ a }</Link>
						<span className="rn-notifications-mat-notification-content-mat-content">liked your tweet</span>
					</React.Fragment>
				);
			break;
			case 'COMMENTED_TWEET_EVENT':
				b = (
					<React.Fragment>
						<Link className="rn-notifications-mat-notification-content-mat-name" to={ `${ links["ACCOUNT_PAGE"] }/${ this.props.contributor.url }` }>{ a }</Link>
						<span className="rn-notifications-mat-notification-content-mat-content">commented your tweet</span>
					</React.Fragment>
				);
			break;
			case 'LIKED_COMMENT_EVENT':
				b = (
					<React.Fragment>
						<Link className="rn-notifications-mat-notification-content-mat-name" to={ `${ links["ACCOUNT_PAGE"] }/${ this.props.contributor.url }` }>{ a }</Link>
						<span className="rn-notifications-mat-notification-content-mat-content">liked your comment</span>
					</React.Fragment>
				);
			break;
			default:
				b = null;
			break;
		}

		return b;
	}

	generateTargetRedirect = () => {
		let a = this.props.eventType,
				b = "";

		switch(a) {
			case 'CREATED_TWEET_EVENT':
			case 'COMMENTED_TWEET_EVENT':
			case 'LIKED_TWEET_EVENT':
			case 'LIKED_COMMENT_EVENT':
				b = `${ links["TWEET_PAGE"] }/${ this.props.redirectID }`;
			break;
			case 'SUBSCRIBED_USER_EVENT':
				b = `${ links["ACCOUNT_PAGE"] }/${ this.props.redirectID }`;
			break;
			default:
				b = "#";
			break;
		}

		return b;
	}

	render() {
		return(
			<React.Fragment>
				<div className="rn-notifications-mat-notification">
					<div className="rn-notifications-mat-notification-sizer">{ /* icon here */ }</div>
					<div className="rn-notifications-mat-notification-content">
						<Link
							className="rn-notifications-mat-notification-content-redirect"
							to={ this.generateTargetRedirect() }
						/>
						<div className="rn-notifications-mat-notification-content-creators">
							<Link className="rn-notifications-mat-notification-content-creators-creator" to={ `${ links["ACCOUNT_PAGE"] }/${ this.props.contributor.url }` }>
								<img src={ this.props.contributor.image ? apiPath + this.props.contributor.image : "" } alt="" />
							</Link>
						</div>
						<div className="rn-notifications-mat-notification-content-mat">
							{ this.generateContent() }
						</div>
						<p className="rn-notifications-mat-notification-content-twpreview">
							{ convertTime(this.props.time, " ago") }
						</p>
					</div>
				</div>
				<Br />
			</React.Fragment>
		);
	}
}

class Notifications extends Component {
	render() {
		if(this.props.isLoading) return <LoadingIcon />;

		return(
			<div className="rn-notifications-mat">
			{
				this.props.data.map(({ id, contributor, eventType, redirectID, time }) => (
					<Notification
						key={ id }
						id={ id }
						contributor={ contributor }
						eventType={ eventType }
						redirectID={ redirectID }
						time={ time }
					/>
				))
			}
			</div>
		);
	}
}

class App extends Component {
	constructor(props) {
		super(props);

		this.state = {
			stage: "ALL_STAGE",
			notifications: false
		}
	}

	componentDidMount() {
		this.fetchAPI();
	}

	fetchAPI = () => {
		let variables = cookieControl.get("userdata");

		client.query({
      query: gql`
				query($id: ID!, $login: String!, $password: String!) {
					user(id: $id, login: $login, password: $password) {
						id,
						notifications {
							id,
							eventType,
							redirectID,
							time,
							contributor {
								image,
								name,
								url
							}
						}
					}
				}
			`,
			variables
		}).then(({ data: { user: { notifications } } }) => {
			if(notifications === null) return;

			this.setState(() => {
				return {
					notifications: notifications
				}
			})
		});
	}

	render() {
		return(
			<div className="rn-notifications">
				<div className="rn-notifications-title">
					<h1 className="rn-notifications-title-mat">Notifications</h1>
				</div>
				<Br />
				<Nav
					currStage={ this.state.stage }
				/>
				<Br />
				<Notifications
					isLoading={ this.state.notifications === false }
					data={ this.state.notifications || [] }
				/>
			</div>
		);
	}
}

export default App;